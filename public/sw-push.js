const API_BASE = '/bills-api';
const RETRY_DELAY_MS = 2000;
// Botones que este SW sabe mostrar/aceptar. No viaja en el payload del
// servidor — es la propia declaración de `options.actions` de abajo la que
// limita qué valores puede tomar `event.action` (el navegador no puede
// inventar uno que no esté en esa lista), así que el chequeo local en
// notificationclick es contra esta misma constante, no un campo remoto.
const KNOWN_ACTIONS = ['pay', 'snooze', 'undo', 'payAll'];

// Cola persistente para acciones que fallaron por red (Fase 6b) — DB propia,
// separada de `bills-pwa-u-<userId>` (esa vive en el hilo principal vía el
// wrapper `idb`, inalcanzable desde acá: sw-push.js es JS plano cargado por
// importScripts, no pasa por el bundler). Nativa, sin dependencias.
const OUTBOX_DB_NAME = 'bills-outbox';
const OUTBOX_STORE = 'entries';

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addOutboxEntry(action, data) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).add({ action, data, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllOutboxEntries() {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOutboxEntry(id) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
  // la notificación se muestra igual pero sin botones accionables. Un push
  // agrupado (Fase 6b) trae `group:true` + `items` en vez de un solo
  // subscriptionId — no hay una suscripción única a la que apuntar.
  const isGroup = payload.group === true;

  // Capacidad del DISPOSITIVO receptor, no algo que el worker pueda saber al
  // enviar (un usuario puede tener push en varios dispositivos) — por eso el
  // chequeo va acá, no en el servidor. Sin `actions` (Safari/iOS), el toque
  // en el cuerpo es la única interacción posible: debe abrir directo la
  // hoja de esa suscripción, no Inicio. Un grupo no tiene una sola
  // suscripción a la que enlazar — cae a Inicio simple.
  const supportsActions = 'actions' in Notification.prototype;
  const fallbackUrl =
    !supportsActions && !isGroup && payload.subscriptionId
      ? `/?p=home&open=${payload.subscriptionId}`
      : (payload.url ?? '/');

  const notificationData = {
    url: fallbackUrl,
    subscriptionId: payload.subscriptionId ?? null,
    notificationKey: payload.notificationKey ?? null,
    actionToken: payload.actionToken ?? null,
    items: isGroup ? (payload.items ?? []) : null,
  };

  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: notificationData,
  };

  if (supportsActions && notificationData.actionToken) {
    if (isGroup) {
      options.actions = [{ action: 'payAll', title: 'Marcar todos' }];
    } else if (notificationData.subscriptionId) {
      options.actions = [
        { action: 'pay', title: 'Marcar pagado' },
        { action: 'snooze', title: 'Posponer 3 días' },
      ];
    }
  }

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

const ACTION_ROUTES = {
  pay: (id) => `${API_BASE}/subscriptions/${id}/mark-paid`,
  snooze: (id) => `${API_BASE}/subscriptions/${id}/snooze`,
  undo: (id) => `${API_BASE}/subscriptions/${id}/undo`,
  // Sin id — el grupo entero vive en el token, no en la URL.
  payAll: () => `${API_BASE}/notifications/pay-all`,
};

function actionRequestBody(action, notificationKey) {
  if (action === 'snooze') return { notificationKey, days: 3 };
  if (action === 'payAll') return {};
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
  payAll: 'Todos marcados como pagados',
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
  // válido para esa acción según lo verifique el backend en el paso 3. Un
  // pago grupal tampoco ofrece un solo "deshacer": cada miembro se deshace
  // por separado desde su propia notificación individual si hace falta.
  if (action !== 'undo' && action !== 'payAll') {
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

/** Reintenta cada entrada de `bills-outbox` contra su ruta real — mismo
 * `postAction` que usa el tap interactivo. Terminal (ok/conflict) borra la
 * entrada y muestra el mismo aviso que el camino interactivo; network-error
 * o rejected la deja para el próximo `sync` o el próximo drenado al abrir
 * la app. Se llama desde los listeners `sync` y `message` de abajo. */
async function drainOutbox() {
  let entries;
  try {
    entries = await getAllOutboxEntries();
  } catch {
    return;
  }

  for (const entry of entries) {
    const result = await postAction(entry.action, entry.data);
    if (result.outcome === 'ok') {
      await deleteOutboxEntry(entry.id);
      await showConfirmation(entry.action, entry.data);
    } else if (result.outcome === 'conflict') {
      await deleteOutboxEntry(entry.id);
      await showConflictNotice(entry.data);
    }
  }
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
  // payAll es la única acción sin un subscriptionId propio: el grupo entero
  // viaja dentro del actionToken.
  if (!KNOWN_ACTIONS.includes(action) || !data.actionToken) return;
  if (action !== 'payAll' && !data.subscriptionId) return;

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

      if (result.outcome === 'network-error') {
        // Se encola en bills-outbox para que `sync` (o el drenado al volver
        // a abrir la app, en navegadores sin Background Sync) la reintente
        // sin que el usuario tenga que repetirla.
        try {
          await addOutboxEntry(action, data);
        } catch {
          // IndexedDB no disponible — sigue el aviso best-effort de abajo.
        }
        if ('sync' in self.registration) {
          try {
            await self.registration.sync.register('bills-action-retry');
          } catch {
            // No soportado en este navegador/SO (p. ej. iOS Safari) — noop.
          }
        }
        await showFailureNotice(data);
        return;
      }

      // 'rejected' — un 4xx/5xx que no sea 409. No es una falla de red:
      // reintentarlo a ciegas no cambiaría el resultado, así que no se
      // encola (a diferencia de network-error arriba).
      await showFailureNotice(data);
    })()
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'bills-action-retry') return;
  event.waitUntil(drainOutbox());
});

// Fallback para navegadores sin Background Sync (iOS Safari) — el cliente
// pide un drenado al volver a poner la app visible (src/lib/push-sync.ts).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'BILLS_DRAIN_OUTBOX') return;
  event.waitUntil(drainOutbox());
});
