import { useCallback, useEffect, useState } from 'react';
import {
  createSubscription as apiCreate,
  deleteSubscription as apiDelete,
  fetchArchivedSubscriptions,
  fetchPaymentHistory,
  fetchSubscriptions,
  markSubscriptionPaid,
  restoreArchivedSubscription as apiRestoreArchived,
  snoozeSubscription as apiSnooze,
  updateSubscription as apiUpdate,
} from '../lib/api';
import { getSessionToken } from '../lib/auth';
import {
  getLocalSubscriptions,
  getPendingOps,
  isOnline,
  putLocalSubscription,
  queuePendingOp,
  removeLocalSubscription,
  replaceLocalSubscriptions,
} from '../lib/offline-db';
import { syncPendingOps } from '../lib/sync';
import { advanceDueDateAfterPayment } from '../lib/due-dates';
import { localIsoDate } from '../lib/local-date';
import { parseDueDates, serializeDueDates } from '../lib/due-dates-json';
import type {
  MarkPaidInput,
  PaymentRecord,
  Subscription,
  SubscriptionInput,
} from '../types/subscription';

export function useSubscriptions(enabled: boolean) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [archived, setArchived] = useState<Subscription[]>([]);
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
        const [{ subscriptions: remote }, { payments: remotePayments }, archivedRes] =
          await Promise.all([
            fetchSubscriptions(),
            fetchPaymentHistory(),
            fetchArchivedSubscriptions(),
          ]);
        await replaceLocalSubscriptions(remote);
        setSubscriptions(remote);
        setPayments(remotePayments);
        setArchived(archivedRes.subscriptions);
      } else {
        setSubscriptions(await getLocalSubscriptions());
        setPayments([]);
        setArchived([]);
      }
    } catch (err) {
      const local = await getLocalSubscriptions();
      setSubscriptions(local);
      setError(local.length === 0 ? (err instanceof Error ? err.message : 'Error') : null);
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
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
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
      user_id: '',
      name: input.name,
      amount: input.amount,
      currency: input.currency ?? 'MXN',
      due_day: input.due_day ?? (input.due_date ? parseInt(input.due_date.slice(8, 10), 10) : 1),
      frequency: input.frequency,
      due_date: input.due_date ?? null,
      due_dates: input.due_dates?.length ? serializeDueDates(input.due_dates) : null,
      category: input.category ?? null,
      notes: input.notes ?? null,
      notify_days_before: input.notify_days_before ?? 1,
      notify_hour: input.notify_hour ?? 9,
      snoozed_until: null,
      deleted_at: null,
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
        await queuePendingOp({ type: 'create', subscriptionId: tempId, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: 'create', subscriptionId: tempId, payload: input });
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
        await queuePendingOp({ type: 'delete', subscriptionId: id });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: 'delete', subscriptionId: id });
      setPendingCount((c) => c + 1);
    }
  };

  const update = async (id: string, input: Partial<SubscriptionInput>) => {
    const dueDatesSerialized =
      input.due_dates !== undefined
        ? input.due_dates.length > 0
          ? serializeDueDates(input.due_dates)
          : null
        : undefined;

    setSubscriptions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const { due_dates: _dd, snoozed_until: _su, ...rest } = input;
        return {
          ...s,
          ...rest,
          ...(dueDatesSerialized !== undefined ? { due_dates: dueDatesSerialized } : {}),
          ...(input.snoozed_until !== undefined ? { snoozed_until: input.snoozed_until } : {}),
          updated_at: new Date().toISOString(),
        };
      })
    );

    if (online && getSessionToken()) {
      try {
        await apiUpdate(id, input);
        await refresh();
      } catch {
        await queuePendingOp({ type: 'update', subscriptionId: id, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({ type: 'update', subscriptionId: id, payload: input });
      setPendingCount((c) => c + 1);
    }
  };

  const markPaid = async (id: string, input?: MarkPaidInput) => {
    setError(null);
    const paidAt = input?.paid_at ?? localIsoDate();

    setSubscriptions((prev) => {
      const sub = prev.find((s) => s.id === id);
      if (!sub) return prev;
      if (sub.frequency === 'once') {
        void removeLocalSubscription(id);
        return prev.filter((s) => s.id !== id);
      }
      return prev.map((s) => {
        if (s.id !== id) return s;
        const patch = advanceDueDateAfterPayment(s);
        const next = {
          ...s,
          last_paid_at: paidAt,
          snoozed_until: null,
          ...(patch
            ? {
                due_date: patch.due_date,
                due_day: patch.due_day,
                due_dates: 'due_dates' in patch ? patch.due_dates : s.due_dates,
              }
            : {}),
          updated_at: new Date().toISOString(),
        };
        void putLocalSubscription(next);
        return next;
      });
    });

    const queueMarkPaid = async () => {
      await queuePendingOp({ type: 'mark-paid', subscriptionId: id, payload: input });
      setPendingCount((c) => c + 1);
    };

    if (online && getSessionToken()) {
      try {
        const result = await markSubscriptionPaid(id, input);
        if (result.archived) {
          setSubscriptions((prev) => prev.filter((s) => s.id !== id));
          await removeLocalSubscription(id);
          const archivedRes = await fetchArchivedSubscriptions();
          setArchived(archivedRes.subscriptions);
        } else {
          setSubscriptions((prev) =>
            prev.map((s) => {
              if (s.id !== id) return s;
              const patch = result.subscription ?? advanceDueDateAfterPayment(s);
              if (!patch?.due_date) {
                return { ...s, last_paid_at: result.paid_at, snoozed_until: null };
              }
              const next = {
                ...s,
                last_paid_at: result.paid_at,
                snoozed_until: null,
                due_date: patch.due_date,
                due_day: patch.due_day,
                due_dates: 'due_dates' in patch ? patch.due_dates : s.due_dates,
                updated_at: result.paid_at,
              };
              void putLocalSubscription(next);
              return next;
            })
          );
        }
        const { payments: remotePayments } = await fetchPaymentHistory();
        setPayments(remotePayments);
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) {
          setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
        } else {
          await queueMarkPaid();
        }
      }
    } else {
      await queueMarkPaid();
    }
  };

  const snooze = async (id: string, days = 3) => {
    setError(null);
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + days);
    const snoozedUntil = until.toISOString().slice(0, 10);
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, snoozed_until: snoozedUntil } : s))
    );

    const queueSnooze = async () => {
      await queuePendingOp({ type: 'snooze', subscriptionId: id, payload: { days } });
      setPendingCount((c) => c + 1);
    };

    if (online && getSessionToken()) {
      try {
        const result = await apiSnooze(id, days);
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, snoozed_until: result.snoozed_until } : s))
        );
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) {
          setError(err instanceof Error ? err.message : 'No se pudo posponer');
        } else {
          await queueSnooze();
        }
      }
    } else {
      await queueSnooze();
    }
  };

  const clearSnooze = async (id: string) => {
    setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, snoozed_until: null } : s)));

    if (online && getSessionToken()) {
      try {
        await apiUpdate(id, { snoozed_until: null });
        await refresh();
      } catch {
        await queuePendingOp({
          type: 'update',
          subscriptionId: id,
          payload: { snoozed_until: null },
        });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queuePendingOp({
        type: 'update',
        subscriptionId: id,
        payload: { snoozed_until: null },
      });
      setPendingCount((c) => c + 1);
    }
  };

  const restore = async (sub: Subscription) => {
    await putLocalSubscription(sub);
    setSubscriptions((prev) => [...prev, sub]);
    if (online && getSessionToken()) {
      try {
        // Use the archived-restore endpoint to clear `deleted_at` and keep payment history.
        // If the record is not in the archive (e.g. was never soft-deleted) this will 404
        // and fall through to the catch below — UX stays intact either way.
        await apiRestoreArchived(sub.id);
        await refresh();
      } catch {
        /* local restore already applied — sync will reconcile on next cycle */
      }
    } else {
      await queuePendingOp({ type: 'restore-archived', subscriptionId: sub.id });
      setPendingCount((c) => c + 1);
    }
  };

  const restoreArchived = async (id: string) => {
    setError(null);
    const archivedSub = archived.find((s) => s.id === id);
    if (archivedSub) {
      setArchived((prev) => prev.filter((s) => s.id !== id));
      setSubscriptions((prev) => [...prev, archivedSub]);
      await putLocalSubscription(archivedSub);
    }

    const queueRestore = async () => {
      await queuePendingOp({ type: 'restore-archived', subscriptionId: id });
      setPendingCount((c) => c + 1);
    };

    if (online && getSessionToken()) {
      try {
        const result = await apiRestoreArchived(id);
        setArchived((prev) => prev.filter((s) => s.id !== id));
        setSubscriptions((prev) => [...prev.filter((s) => s.id !== id), result.subscription]);
        await putLocalSubscription(result.subscription);
        const { payments: remotePayments } = await fetchPaymentHistory();
        setPayments(remotePayments);
        return result.subscription.name;
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) {
          setError(err instanceof Error ? err.message : 'No se pudo restaurar');
          return null;
        }
        await queueRestore();
        return archivedSub?.name ?? null;
      }
    }

    await queueRestore();
    return archivedSub?.name ?? null;
  };

  const addMany = async (inputs: SubscriptionInput[]) => {
    for (const input of inputs) {
      await add(input);
    }
  };

  return {
    subscriptions,
    archived,
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
    clearSnooze,
    restore,
    restoreArchived,
  };
}
