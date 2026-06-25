import { useCallback, useEffect, useState } from "react";
import {
  createSubscription as apiCreate,
  deleteSubscription as apiDelete,
  fetchPaymentHistory,
  fetchSubscriptions,
  markSubscriptionPaid,
  snoozeSubscription as apiSnooze,
  updateSubscription as apiUpdate,
} from "../lib/api";
import { getSessionToken } from "../lib/auth";
import {
  getLocalSubscriptions,
  getPendingOps,
  isOnline,
  putLocalSubscription,
  queuePendingOp,
  removeLocalSubscription,
  replaceLocalSubscriptions,
} from "../lib/offline-db";
import { syncPendingOps } from "../lib/sync";
import type { MarkPaidInput, PaymentRecord, Subscription, SubscriptionInput } from "../types/subscription";

export function useSubscriptions(enabled: boolean) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(isOnline());
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      if (online && getSessionToken()) {
        await syncPendingOps();
        const [{ subscriptions: remote }, { payments: remotePayments }] = await Promise.all([
          fetchSubscriptions(),
          fetchPaymentHistory(),
        ]);
        await replaceLocalSubscriptions(remote);
        setSubscriptions(remote);
        setPayments(remotePayments);
      } else {
        setSubscriptions(await getLocalSubscriptions());
        setPayments([]);
      }
    } catch (err) {
      const local = await getLocalSubscriptions();
      setSubscriptions(local);
      setError(local.length === 0 ? (err instanceof Error ? err.message : "Error") : null);
    } finally {
      setLoading(false);
    }
  }, [enabled, online]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (enabled && getSessionToken()) {
        void syncPendingOps().then(() => refresh());
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(async () => {
      const ops = await getPendingOps();
      setPendingCount(ops.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [enabled]);

  const add = async (input: SubscriptionInput) => {
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic: Subscription = {
      id: tempId,
      user_id: "",
      name: input.name,
      amount: input.amount,
      currency: input.currency ?? "MXN",
      due_day: input.due_day ?? (input.due_date ? parseInt(input.due_date.slice(8, 10), 10) : 1),
      frequency: input.frequency,
      due_date: input.due_date ?? null,
      category: input.category ?? null,
      notes: input.notes ?? null,
      notify_days_before: input.notify_days_before ?? 3,
      notify_hour: input.notify_hour ?? 9,
      snoozed_until: null,
      last_paid_at: null,
      created_at: now,
      updated_at: now,
    };

    await putLocalSubscription(optimistic);
    setSubscriptions((prev) => [...prev, optimistic]);

    if (online && getSessionToken()) {
      try {
        const { id } = await apiCreate(input);
        await removeLocalSubscription(tempId);
        await putLocalSubscription({ ...optimistic, id });
        await refresh();
      } catch {
        await queuePendingOp({ type: "create", subscriptionId: tempId, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: "create", subscriptionId: tempId, payload: input });
      setPendingCount((c) => c + 1);
    }
  };

  const remove = async (id: string) => {
    await removeLocalSubscription(id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));

    if (online && getSessionToken()) {
      try {
        await apiDelete(id);
      } catch {
        await queuePendingOp({ type: "delete", subscriptionId: id });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: "delete", subscriptionId: id });
      setPendingCount((c) => c + 1);
    }
  };

  const update = async (id: string, input: Partial<SubscriptionInput>) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...input,
              updated_at: new Date().toISOString(),
            }
          : s,
      ),
    );

    if (online && getSessionToken()) {
      try {
        await apiUpdate(id, input);
        await refresh();
      } catch {
        await queuePendingOp({ type: "update", subscriptionId: id, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: "update", subscriptionId: id, payload: input });
      setPendingCount((c) => c + 1);
    }
  };

  const markPaid = async (id: string, input?: MarkPaidInput) => {
    if (!online || !getSessionToken()) {
      setError("Conéctate para registrar el pago");
      return;
    }
    try {
      const result = await markSubscriptionPaid(id, input);
      if (result.archived) {
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
        await removeLocalSubscription(id);
      } else {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, last_paid_at: result.paid_at } : s)),
        );
      }
      const { payments: remotePayments } = await fetchPaymentHistory();
      setPayments(remotePayments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    }
  };

  const snooze = async (id: string, days = 3) => {
    if (!online || !getSessionToken()) {
      setError("Conéctate para posponer");
      return;
    }
    try {
      const result = await apiSnooze(id, days);
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, snoozed_until: result.snoozed_until } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo posponer");
    }
  };

  const restore = async (sub: Subscription) => {
    await putLocalSubscription(sub);
    setSubscriptions((prev) => [...prev, sub]);
    if (online && getSessionToken()) {
      try {
        await apiCreate({
          name: sub.name,
          amount: sub.amount,
          currency: sub.currency,
          frequency: sub.frequency,
          due_day: sub.due_day,
          due_date: sub.due_date ?? undefined,
          category: sub.category ?? undefined,
          notes: sub.notes ?? undefined,
          notify_days_before: sub.notify_days_before,
          notify_hour: sub.notify_hour,
        });
        await refresh();
      } catch {
        /* local restore is enough for undo UX */
      }
    }
  };

  const addMany = async (inputs: SubscriptionInput[]) => {
    for (const input of inputs) {
      await add(input);
    }
  };

  return {
    subscriptions,
    payments,
    loading,
    online,
    error,
    pendingCount,
    refresh,
    add,
    addMany,
    remove,
    update,
    markPaid,
    snooze,
    restore,
  };
}
