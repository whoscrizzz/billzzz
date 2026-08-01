const API_BASE = '/bills-api';
const RETRY_DELAY_MS = 2000;
// Botones que este SW sabe mostrar/aceptar. No viaja en el payload del
// servidor — es la propia declaración de `options.actions` de abajo la que
// limita qué valores puede tomar `event.action` (el navegador no puede
// inventar uno que no esté en esa lista), así que el chequeo local en
// notificationclick es contra esta misma constante, no un campo remoto.
const KNOWN_ACTIONS = ['pay', 'snooze', 'undo'];

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'BILLS_PUSH_RESYNC' });
      }
    })()
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Bills', body: 'Tienes un recordatorio de pago', url: '/' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  // subscriptionId/notificationKey/actionToken los arma el worker en
  // sendDueNotifications (worker/src/notifications.ts) — actionToken falta
  // si ACTION_TOKEN_SECRET no está configurado en el servidor, en cuyo caso
  // la notificación se muestra igual pero sin botones accionables.
  const notificationData = {
    url: payload.url ?? '/',
    subscriptionId: payload.subscriptionId ?? null,
    notificationKey: payload.notificationKey ?? null,
    actionToken: payload.actionToken ?? null,
  };

  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: notificationData,
  };

  if (notificationData.actionToken && notificationData.subscriptionId) {
    options.actions = [
      { action: 'pay', title: 'Marcar pagado' },
      { action: 'snooze', title: 'Posponer 3 días' },
    ];
  }

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

const ACTION_ROUTES = {
  pay: (id) => `${API_BASE}/subscriptions/${id}/mark-paid`,
  snooze: (id) => `${API_BASE}/subscriptions/${id}/snooze`,
  undo: (id) => `${API_BASE}/subscriptions/${id}/undo`,
};

function actionRequestBody(action, notificationKey) {
  if (action === 'snooze') return { notificationKey, days: 3 };
  return { notificationKey };
}

/** POST autenticado con el token de acción (nunca Authorization, para no
 * mezclarlo con el sistema de sesión) — un reintento simple si falla por
 * red. Un 409 (el backend detectó que el bill cambió por otra vía, o que ya
 * se tomó otra acción para este mismo aviso) es una respuesta real del
 * servidor, no una falla de red — no se reintenta, es terminal por diseño. */
async function postAction(action, data) {
  const url = ACTION_ROUTES[action](data.subscriptionId);
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Action-Token': data.actionToken,
    },
    body: JSON.stringify(actionRequestBody(action, data.notificationKey)),
  };

  const classify = (res) => {
    if (res.ok) return { outcome: 'ok' };
    if (res.status === 409) return { outcome: 'conflict' };
    return { outcome: 'rejected', status: res.status };
  };

  try {
    return classify(await fetch(url, init));
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return classify(await fetch(url, init));
    } catch {
      return { outcome: 'network-error' };
    }
  }
}

const CONFIRM_TITLE = {
  pay: 'Marcado como pagado',
  snooze: 'Pospuesto 3 días',
  undo: 'Deshecho',
};

async function showConfirmation(action, data) {
  const options = {
    body: '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `action-confirm-${data.notificationKey}`,
    data,
  };
  // El "deshacer" solo se ofrece sobre la confirmación de pay/snooze, no
  // sobre la confirmación de un undo — mismo actionToken, sigue siendo
  // válido para esa acción según lo verifique el backend en el paso 3.
  if (action !== 'undo') {
    options.actions = [{ action: 'undo', title: 'Deshacer' }];
  }
  await self.registration.showNotification(CONFIRM_TITLE[action] ?? 'Listo', options);
}

async function showFailureNotice(data) {
  await self.registration.showNotification('No se pudo completar', {
    body: 'Sin conexión — se reintentará cuando abras la app.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `action-failed-${data.notificationKey}`,
    data,
  });
}

/** 409 terminal — el backend ya detectó el conflicto (el bill cambió por
 * otra vía, o ya se tomó otra acción para este mismo aviso) y no hay nada
 * que reintentar automáticamente. No se ofrece forma de forzarlo desde acá:
 * el usuario resuelve abriendo la app, a propósito. */
async function showConflictNotice(data) {
  await self.registration.showNotification('No se pudo completar', {
    body: 'Esto cambió desde otro lado — abre la app para revisar.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `action-conflict-${data.notificationKey}`,
    data,
  });
}

function focusOrOpen(target) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ('focus' in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  });
}

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  event.notification.close();

  if (!action) {
    // Tap en el cuerpo, no en un botón — comportamiento de siempre.
    event.waitUntil(focusOrOpen(data.url ?? '/'));
    return;
  }

  // Defensa en profundidad: el navegador ya restringe event.action a los
  // valores declarados en options.actions al mostrar la notificación, pero
  // igual se valida acá antes de gastar un fetch — el backend vuelve a
  // validar el token por su cuenta en el paso 3, esto no reemplaza eso.
  if (!KNOWN_ACTIONS.includes(action) || !data.actionToken || !data.subscriptionId) {
    return;
  }

  event.waitUntil(
    (async () => {
      const result = await postAction(action, data);

      if (result.outcome === 'ok') {
        await showConfirmation(action, data);
        return;
      }

      if (result.outcome === 'conflict') {
        // Terminal por diseño — el backend ya resolvió que no es seguro
        // reintentar (ver worker/src/notification-actions.ts checkUndoState
        // y el 409 de "otra acción ya registrada" en mark-paid/snooze). Sin
        // Background Sync, sin reintento: forzarlo pisaría un cambio que
        // pasó por otro lado.
        await showConflictNotice(data);
        return;
      }

      // network-error o un 4xx/5xx que no sea 409 — mismo camino que hoy:
      // sin cola persistente todavía (Fase 6b), el registro de Background
      // Sync de acá abajo es best-effort para cuando exista algo que
      // drenar; el aviso le pide al usuario abrir la app mientras tanto.
      if ('sync' in self.registration) {
        try {
          await self.registration.sync.register('bills-action-retry');
        } catch {
          // No soportado en este navegador/SO (p. ej. iOS Safari) — noop.
        }
      }
      await showFailureNotice(data);
    })()
  );
});

// Placeholder documentado: sin cola en IndexedDB todavía, no hay nada que
// drenar. Fase 6b agrega el store `bills-outbox` y el drenado real acá.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'bills-action-retry') return;
});
