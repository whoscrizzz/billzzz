// Regresión: dos llamadas concurrentes a syncPendingOps() deben compartir una
// sola corrida. Al reconectar hay dos disparadores casi simultáneos —
// useSubscriptions llama a la sync desde el handler del evento `online`, y su
// setOnline(true) cambia la identidad de `refresh`, disparando el useEffect
// que la llama otra vez. Sin el guard de "in flight" ambas leen la cola antes
// de que ninguna haya hecho clearPendingOp, y una suscripción creada offline
// se sube DOS veces (un pago duplicado en la cuenta del usuario).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const created = [];
let queue = [
  { id: 1, type: 'create', subscriptionId: 'temp-1', payload: { name: 'Netflix', amount: 219, frequency: 'monthly' } },
];

const { syncPendingOps } = await loadTsModule('src/lib/sync.ts', {
  stubs: {
    './api': {
      createSubscription: async (payload) => {
        // Latencia real: sin ella las dos corridas se serializarían por azar.
        await new Promise((r) => setTimeout(r, 20));
        created.push(payload.name);
        return { id: `server-${created.length}` };
      },
      updateSubscription: async () => {},
      deleteSubscription: async () => {},
      markSubscriptionPaid: async () => ({}),
      snoozeSubscription: async () => ({}),
      restoreArchivedSubscription: async () => ({}),
      restoreTrashedSubscription: async () => ({}),
      fetchSubscriptions: async () => ({ subscriptions: [] }),
    },
    './offline-db': {
      getPendingOps: async () => queue,
      clearPendingOp: async (id) => {
        queue = queue.filter((op) => op.id !== id);
      },
      putLocalSubscription: async () => {},
      removeLocalSubscription: async () => {},
      replaceLocalSubscriptions: async () => {},
      remapPendingOpSubscriptionId: async () => {},
    },
  },
});

test('dos syncs concurrentes suben el create una sola vez', async () => {
  await Promise.all([syncPendingOps(), syncPendingOps()]);
  assert.deepEqual(created, ['Netflix'], 'la suscripción encolada se subió más de una vez');
});
