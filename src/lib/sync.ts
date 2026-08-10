import {
  createSubscription,
  deleteSubscription,
  fetchSubscriptions,
  markSubscriptionPaid,
  restoreArchivedSubscription,
  restoreTrashedSubscription,
  snoozeSubscription,
  updateSubscription,
} from './api';
import type { MarkPaidInput, SubscriptionInput } from '../types/subscription';
import { serializeDueDates, serializeDueDays } from './due-dates-json';
import {
  clearPendingOp,
  getPendingOps,
  putLocalSubscription,
  replaceLocalSubscriptions,
} from './offline-db';

/** Corrida en vuelo compartida entre llamadores concurrentes.
 *
 * Al reconectar hay DOS disparadores casi simultáneos: el handler del evento
 * `online` en useSubscriptions llama a esta función directamente, y su
 * `setOnline(true)` cambia la identidad de `refresh` (depende de `online`), lo
 * que dispara el useEffect que llama a `refresh()` — que vuelve a llamar acá.
 * Sin este guard las dos corridas leen la misma cola antes de que ninguna haya
 * hecho `clearPendingOp`, y una suscripción creada offline se sube DOS veces
 * (verificado con la cola equivalente de notas: dos filas idénticas en D1).
 *
 * Este archivo es casi idéntico a notes-sync.ts (misma cola, mismo guard,
 * mismo retry 4xx/5xx) — a propósito, no es una abstracción compartida (ver
 * CLAUDE.md § Conventions and gotchas). Si tocás este guard o el retry,
 * replicá el cambio allá. */
let inFlight: Promise<number> | null = null;

export async function syncPendingOps(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<number> {
  const ops = await getPendingOps();
  let synced = 0;

  for (const op of ops) {
    if (op.id == null) continue;
    const subscriptionId = op.subscriptionId;

    try {
      switch (op.type) {
        case 'create': {
          // El payload ya trae el id que useSubscriptions.ts generó al
          // encolar (crypto.randomUUID()) — createSubscription lo usa como
          // PRIMARY KEY en el server, así que `id` acá es siempre igual a
          // `subscriptionId`. No hace falta remapear nada: si este mismo
          // create se reintenta (ver dedup-is-a-claim en
          // worker/src/subscriptions.ts), el server responde con el mismo
          // id en vez de crear una fila duplicada.
          const payload = op.payload as SubscriptionInput;
          const { id } = await createSubscription(payload);
          await putLocalSubscription({
            id,
            user_id: '',
            name: payload.name,
            amount: payload.amount,
            currency: payload.currency ?? 'MXN',
            due_day:
              payload.due_day ??
              (payload.due_date ? parseInt(payload.due_date.slice(8, 10), 10) : 1),
            frequency: payload.frequency,
            due_date: payload.due_date ?? null,
            due_dates: payload.due_dates?.length ? serializeDueDates(payload.due_dates) : null,
            due_days: payload.due_days?.length ? serializeDueDays(payload.due_days) : null,
            interval_count: payload.interval_count ?? null,
            interval_unit: payload.interval_unit ?? null,
            category: payload.category ?? null,
            notes: payload.notes ?? null,
            notify_days_before: payload.notify_days_before ?? 1,
            notify_hour: payload.notify_hour ?? 9,
            snoozed_until: null,
            deleted_at: null,
            trashed_at: null,
            last_paid_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          break;
        }
        case 'update': {
          await updateSubscription(subscriptionId, op.payload as Partial<SubscriptionInput>);
          break;
        }
        case 'delete': {
          await deleteSubscription(subscriptionId);
          break;
        }
        case 'mark-paid': {
          await markSubscriptionPaid(subscriptionId, op.payload as MarkPaidInput | undefined);
          break;
        }
        case 'snooze': {
          const days = (op.payload as { days: number } | undefined)?.days ?? 3;
          await snoozeSubscription(subscriptionId, days);
          break;
        }
        case 'restore-archived': {
          await restoreArchivedSubscription(subscriptionId);
          break;
        }
        case 'restore-trashed': {
          await restoreTrashedSubscription(subscriptionId);
          break;
        }
        default: {
          const _exhaustive: never = op.type;
          return _exhaustive;
        }
      }
      await clearPendingOp(op.id);
      synced++;
    } catch (err) {
      // 4xx = permanent client error (bad data, conflict) — discard the op and continue.
      // 5xx / network error = transient — stop here and retry next cycle.
      const status = (err as { status?: number })?.status ?? 0;
      if (status >= 400 && status < 500) {
        await clearPendingOp(op.id);
        continue;
      }
      break;
    }
  }

  if (synced > 0) {
    const { subscriptions } = await fetchSubscriptions();
    await replaceLocalSubscriptions(subscriptions);
  }

  return synced;
}
