import {
  fetchNotificationHealth,
  fetchPushStatus,
  subscribeToPush,
  syncPushSubscriptionToServer,
  type NotificationHealth,
} from './api';
import { isStandalonePwa } from './pwa';

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** Re-post current push subscription to the server (idempotent upsert). */
export async function syncPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (isIos() && !isStandalonePwa()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      return subscribeToPush();
    }
    await syncPushSubscriptionToServer(sub.toJSON());
    return true;
  } catch {
    return false;
  }
}

export function initPushSyncListeners(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    void syncPushSubscription();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string };
    if (data?.type === 'BILLS_PUSH_RESYNC') {
      void syncPushSubscription();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncPushSubscription();
      void drainNotificationOutbox();
    }
  });
}

/** Fallback para navegadores sin Background Sync (iOS Safari no lo soporta):
 * al volver a poner la app visible, le pide al SW que drene `bills-outbox`
 * — mismo drenado que dispararía el evento `sync` donde sí existe. */
async function drainNotificationOutbox(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'BILLS_DRAIN_OUTBOX' });
  } catch {
    // Sin SW activo todavía — nada que drenar.
  }
}

export async function getPushHealth(): Promise<{
  clientSubscribed: boolean;
  serverCount: number;
  needsRenewal: boolean;
  delivery: NotificationHealth | null;
}> {
  let clientSubscribed = false;
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      clientSubscribed = !!(await reg.pushManager.getSubscription());
    } catch {
      clientSubscribed = false;
    }
  }
  let serverCount = 0;
  try {
    const status = await fetchPushStatus();
    serverCount = status.serverCount;
  } catch {
    serverCount = 0;
  }
  let delivery: NotificationHealth | null = null;
  try {
    delivery = await fetchNotificationHealth();
  } catch {
    delivery = null;
  }
  return {
    clientSubscribed,
    serverCount,
    needsRenewal: Notification.permission === 'granted' && !clientSubscribed,
    delivery,
  };
}

export function pushPrerequisitesMet(): { ok: boolean; reason?: string } {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Este navegador no soporta notificaciones push.' };
  }
  if (isIos() && !isStandalonePwa()) {
    return {
      ok: false,
      reason: 'En iPhone, añade Bills a la pantalla de inicio antes de activar avisos.',
    };
  }
  return { ok: true };
}
