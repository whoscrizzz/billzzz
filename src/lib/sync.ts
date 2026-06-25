import {
  createSubscription,
  deleteSubscription,
  fetchSubscriptions,
  updateSubscription,
} from "./api";
import type { SubscriptionInput } from "../types/subscription";
import {
  clearPendingOp,
  getPendingOps,
  putLocalSubscription,
  removeLocalSubscription,
  replaceLocalSubscriptions,
} from "./offline-db";

export async function syncPendingOps(): Promise<number> {
  const ops = await getPendingOps();
  let synced = 0;

  for (const op of ops) {
    if (op.id == null) continue;

    try {
      switch (op.type) {
        case "create": {
          const payload = op.payload as SubscriptionInput;
          const { id } = await createSubscription(payload);
          await removeLocalSubscription(op.subscriptionId);
          await putLocalSubscription({
            id,
            user_id: "",
            name: payload.name,
            amount: payload.amount,
            currency: payload.currency ?? "MXN",
            due_day:
              payload.due_day ??
              (payload.due_date ? parseInt(payload.due_date.slice(8, 10), 10) : 1),
            frequency: payload.frequency,
            due_date: payload.due_date ?? null,
            category: payload.category ?? null,
            notes: payload.notes ?? null,
            notify_days_before: payload.notify_days_before ?? 3,
            notify_hour: payload.notify_hour ?? 9,
            snoozed_until: null,
            last_paid_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          break;
        }
        case "update": {
          await updateSubscription(
            op.subscriptionId,
            op.payload as Partial<SubscriptionInput>,
          );
          break;
        }
        case "delete": {
          await deleteSubscription(op.subscriptionId);
          break;
        }
        default: {
          const _exhaustive: never = op.type;
          return _exhaustive;
        }
      }
      await clearPendingOp(op.id);
      synced++;
    } catch {
      break;
    }
  }

  if (synced > 0) {
    const { subscriptions } = await fetchSubscriptions();
    await replaceLocalSubscriptions(subscriptions);
  }

  return synced;
}
