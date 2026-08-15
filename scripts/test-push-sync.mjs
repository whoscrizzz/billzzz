// Regresión: getPushHealth() ocultaba el aviso de "reactivar notificaciones"
// justo en el caso más accionable — cuando el servidor podó la última
// suscripción push del usuario (serverCount === 0) y el navegador ya
// concedió el permiso pero no tiene una suscripción activa. needsRenewal
// exigía serverCount > 0, así que ese caso no mostraba ningún CTA, solo la
// alerta congelada de notification_attempts (ver test-notifications.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

async function loadWithServerCount(serverCount) {
  return loadTsModule('src/lib/push-sync.ts', {
    stubs: {
      './api': {
        fetchPushStatus: async () => ({ serverCount }),
        fetchNotificationHealth: async () => null,
        subscribeToPush: async () => false,
        syncPushSubscriptionToServer: async () => {},
      },
    },
  });
}

/** Node's built-in `navigator` global is a read-only getter — override it
 * (and stub `window`/`Notification`, which Node doesn't define at all) so
 * getPushHealth() sees "no serviceWorker, permission granted" like a real
 * browser without an active push subscription. */
function stubBrowserGlobals(permission) {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'Notification', {
    value: { permission },
    configurable: true,
  });
}

test('needsRenewal fires when the server has zero subscriptions and permission is granted', async () => {
  stubBrowserGlobals('granted');

  const { getPushHealth } = await loadWithServerCount(0);
  const health = await getPushHealth();

  assert.equal(health.serverCount, 0);
  assert.equal(
    health.needsRenewal,
    true,
    'a fully pruned server subscription is the most actionable case — it must not be silently excluded'
  );
});

test('needsRenewal still fires for the existing stale-subscription case (serverCount > 0)', async () => {
  stubBrowserGlobals('granted');

  const { getPushHealth } = await loadWithServerCount(1);
  const health = await getPushHealth();

  assert.equal(health.needsRenewal, true);
});

test('needsRenewal does not fire without notification permission', async () => {
  stubBrowserGlobals('default');

  const { getPushHealth } = await loadWithServerCount(0);
  const health = await getPushHealth();

  assert.equal(health.needsRenewal, false);
});
