# Fases 5–8 — Plan posterior al rediseño

Estado de partida: Fases 0–4 mergeadas en `main` (modo oscuro y tokens, icono 2b, acceso y primer uso, recurrencias por intervalo, analítica de gasto).
Fecha: 2026-07-31.

Orden deliberado: la Fase 5 corrige una pérdida de datos real y va primero. Después, las tres capacidades que sacan a Bills de la propia app (notificación, widget, captura rápida), que comparten una misma dependencia técnica y conviene hacer seguidas. La Fase 8 es la única puramente visual.

---

## Fase 5 — Arreglar el borrado accidental (prioridad cero)

**Problema real reportado:** al deslizar una tarjeta de pago se han eliminado recordatorios sin querer. Hoy `SubscriptionCard.tsx` expone acciones destructivas en el gesto de swipe, y un gesto ambiguo (scroll vertical vs. swipe horizontal) alcanza para destruir un registro.

**Principio:** ningún gesto debe poder destruir datos. El swipe se reserva para acciones reversibles; borrar exige intención explícita.

1. **Quitar «Eliminar» del swipe.** El gesto deja solo acciones reversibles:
   - Deslizar a la derecha → **Marcar pagado** (la acción más frecuente; ya es reversible con el toast de deshacer).
   - Deslizar a la izquierda → **Posponer 3 días** (`snoozed_until`, también reversible).
2. **Borrar vive solo en la hoja de detalle.** Toque en la fila → hoja → «Eliminar», que pide confirmación (`ConfirmDialog` ya existe en el repo) y deja toast de deshacer.
3. **Endurecer el reconocimiento del gesto** en `SubscriptionCard.tsx`:
   - Umbral de activación de al menos 96 px o 45 % del ancho de la tarjeta, lo que sea mayor.
   - Si el desplazamiento vertical supera 12 px antes de cruzar el umbral horizontal, cancelar el swipe (es scroll, no gesto).
   - Requerir que el dedo se levante pasado el umbral; nada se dispara a mitad del arrastre.
   - `touch-action: pan-y` en la tarjeta para que el navegador no compita con el gesto.
4. **Deshacer con más margen.** Subir la ventana del toast de 5 s a 8 s para acciones reversibles, y a 12 s para un borrado confirmado.
5. **Papelera de 30 días.** Campo `deleted_at` en `subscriptions` en lugar de borrado físico; sección «Eliminados recientemente» en Ajustes con «Restaurar». Purga automática pasados 30 días. Esto convierte cualquier error futuro en algo recuperable, no en una pérdida.
6. **Tests:** gesto vertical no dispara acción; swipe corto no dispara acción; borrado exige confirmación; restaurar desde papelera devuelve el pago con su recurrencia intacta.

**Criterio de cierre:** no existe ninguna ruta en la que un solo gesto elimine un recordatorio, y todo borrado es recuperable durante 30 días.

---

## Fase 6 — Notificación accionable

**Por qué primero de las tres:** ataca directamente el trabajo principal («no olvidar pagar») y elimina el paso de abrir la app y buscar el pago.

### 6a — hecho, ya en `main`

Token de acción firmado (HMAC, `worker/src/notification-actions.ts`) para que `notificationclick` en `public/sw-push.js` autentique mark-paid/snooze/undo sin sesión ni red garantizada: el payload del push trae `subscriptionId`/`notificationKey`/`actionToken`, el SW muestra botones «Marcar pagado» / «Posponer 3 días», postea con header `X-Action-Token` (nunca `Authorization`), y sobre la confirmación ofrece «Deshacer». Reintenta una vez por red; un 409 es terminal (conflicto real detectado por el backend, no se reintenta).

### 6b — pendiente

1. **Agrupar.** Cuando `notifications.ts` (`sendDueNotifications`) tiene varios pagos vencidos/por vencer el mismo día para el mismo usuario, enviar **un solo push agrupado** («3 pagos hoy · $9,359») en vez de uno por suscripción. Payload sin `subscriptionId` único — en su lugar una lista `{ id, name, amount }[]`; el SW muestra una sola notificación con acción «Marcar todos» (toque simple abre la app en Inicio, no una hoja de detalle).
   - Backend: nueva ruta o extensión de `notification-actions.ts` que acepte un `notificationKey` agrupado (`ver worker/src/notification-actions.ts` parseNotificationKey — necesita una variante para múltiples `subscriptionId`) y un token de acción cuyos `actions` cubran `pay` para cada id de la lista; aplicar el mismo patrón claim-first (`claimNotificationAction`) por-suscripción dentro de una sola transacción `db.batch`.
   - SW: `sw-push.js` ya declara `KNOWN_ACTIONS`; agregar `payAll` y su ruta en `ACTION_ROUTES`, con `actionRequestBody` mandando el array de ids.
2. **Cola persistente (IndexedDB `bills-outbox`) + Background Sync real.** Hoy `sw-push.js` deja el registro de `sync.register('bills-action-retry')` como best-effort documentado y el listener `sync` no drena nada (comentario explícito: «Fase 6b agrega el store `bills-outbox» y el drenado real»). Implementar:
   - Al fallar `postAction` por red, escribir la acción pendiente en un store IndexedDB `bills-outbox` (no `localStorage` — inaccesible desde el SW) en vez de solo mostrar `showFailureNotice`.
   - El listener `sync` (tag `bills-action-retry`) lee `bills-outbox`, reintenta cada entrada contra su `ACTION_ROUTES`, y borra la entrada si el resultado es `ok` o `conflict` (terminal); la deja si sigue siendo `network-error`.
   - Al abrir la app, drenar también `bills-outbox` por si el navegador no disparó `sync` (iOS Safari no soporta Background Sync — mismo caso que ya maneja el comentario de `sw-push.js` sobre `'sync' in self.registration`).
3. **Fallback iOS** (ítem 6 original): si `showNotification` no admite `actions` (Safari/iOS), degradar a notificación simple que abre la app directo en la hoja del pago correspondiente, no en Inicio — usar `data.url` con la ruta de detalle en vez de `/`.

**Criterio de cierre 6b:** varios pagos el mismo día generan un solo push con «Marcar todos»; una acción fallida por red se resuelve sola al recuperar conexión (o al reabrir la app) sin que el usuario tenga que repetirla.

---

## Fase 7 — Widget y captura rápida

Las dos caras de «que la app no me obligue a abrirla».

### 7a — Widget de pantalla de inicio

1. **Vía PWA:** iOS no permite widgets nativos desde una PWA, así que la ruta realista es un **atajo de la app Atajos** con una vista de resumen, o una pantalla dedicada `#/resumen` optimizada para captura de pantalla en la pantalla de bloqueo. Evaluar y documentar el límite antes de invertir.
2. **Contenido:** próximo pago (nombre, monto, «en N días») y disponible del mes. Nada más — un widget con seis datos no se lee.
3. **Dos tamaños:** línea única (próximo pago) y cuadrado (próximo pago + disponible por día + barra de presupuesto).
4. **Si el widget nativo no es viable:** priorizar 7b y dejar el resumen como pantalla de arranque opcional configurable en Ajustes («Abrir la app en: Hoy / Resumen»).

### 7b — Registrar sin abrir la app

1. **Atajo de Siri / Atajos** que reciba texto o dictado: «Bills, 320 de comida» → parsea monto y categoría y registra. Reutilizar el parser de `ImportRemindersPanel`, que ya interpreta texto libre.
2. **Endpoint de captura** con autenticación por token de dispositivo, para que el atajo no requiera pasar por el login.
3. **Share sheet:** aceptar texto compartido desde otras apps (`web_share_target` en el manifest) y abrir la hoja de registro precargada con lo compartido.
4. **Confirmación silenciosa:** notificación breve de que el gasto quedó registrado, con «Deshacer».
5. **Fallback:** si el parseo es ambiguo, abrir la hoja de registro con lo que sí se entendió, sin descartar la captura.

**Criterio de cierre:** registrar un gasto típico sin abrir la app y sin escribir más de una frase.

---

## Fase 8 — Calendario del mes (sustituye al heatmap)

**Estado: resuelto en el prototipo.** `Bills 1b v2 — oscuro, calculadora y recurrencias.dc.html`, tab Gastos, reemplaza la sección «Por día» por esta retícula — úsala como referencia de implementación en vez del punto 6 (que sigue describiendo la idea original).

El mapa de calor de la opción 1c se descarta: con 10–25 pagos de fechas fijas colorea información que la lista ya comunica, y solo sirve para mirar el pasado. En su lugar, un calendario **para planear**.

1. **Retícula del mes** con los pagos listados por día, no solo coloreados: cada celda muestra el número del día y hasta dos pagos con su monto; «+N» cuando hay más.
2. **Toque en un día** → hoja con todos los pagos de ese día y su total.
3. **Marcadores de estado:** punto por categoría, vencido en rojo, pagado en verde tenue, hoy con anillo.
4. **Total semanal** en el margen derecho de cada fila, para ver qué semana viene cargada.
5. **Navegación** entre meses coherente con la de Gastos, y salto a «Hoy».
6. **Referencia visual:** la retícula de 7 columnas de `Bills - 3 direcciones.dc.html`, opción 1c, cambiando el relleno de calor por lista de pagos.
7. **Escritorio:** `Bills - vista escritorio.dc.html` (nuevo) es la referencia de layout para pantallas anchas — sidebar de navegación + calendario a dos columnas con panel de categorías, sin el donut ni los controles duplicados que se colaron en la primera implementación. Reutiliza el mismo color por estado (verde pagado, rojo vencido, acento hoy) que la versión mobile.

**Criterio de cierre:** responde «¿qué cae la semana que viene?» sin salir de la pantalla.

---

## Fuera del rediseño

- Vulnerabilidad de Dependabot pendiente en el repo.
- `MultiDateChips.tsx` y `WeekdayPills.tsx` posiblemente sin uso tras `RecurrenceSheet`: confirmar y borrar.
- `AddSubscriptionForm.tsx` es solo un re-export de `RegisterPanel`; confirmar que es intencional.
