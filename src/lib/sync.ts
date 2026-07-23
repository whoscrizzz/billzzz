import {
  createSubscription,
  deleteSubscription,
  fetchSubscriptions,
  markSubscriptionPaid,
  restoreArchivedSubscription,
  snoozeSubscription,
  updateSubscription,
} from './api';
import type { MarkPaidInput, SubscriptionInput } from '../types/subscription';
import { serializeDueDates } from './due-dates-json';
import {
  clearPendingOp,
  getPendingOps,
  putLocalSubscription,
  remapPendingOpSubscriptionId,
  removeLocalSubscription,
  replaceLocalSubscriptions,
} from './offline-db';

export async function syncPendingOps(): Promise<number> {
  const ops = await getPendingOps();
  let synced = 0;
  // Ops queued against a not-yet-synced local id must follow it to the real
  // server id once its `create` op lands, or they 404 and get discarded.
  const idRemap = new Map<string, string>();

  for (const op of ops) {
    if (op.id == null) continue;
    const subscriptionId = idRemap.get(op.subscriptionId) ?? op.subscriptionId;

    try {
      switch (op.type) {
        case 'create': {
          const payload = op.payload as SubscriptionInput;
          const { id } = await createSubscription(payload);
          idRemap.set(op.subscriptionId, id);
          await remapPendingOpSubscriptionId(op.subscriptionId, id);
          await removeLocalSubscription(op.subscriptionId);
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
            category: payload.category ?? null,
            notes: payload.notes ?? null,
            notify_days_before: payload.notify_days_before ?? 1,
            notify_hour: payload.notify_hour ?? 9,
            snoozed_until: null,
            deleted_at: null,
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
