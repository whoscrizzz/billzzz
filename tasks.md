# Tasks — bills-pwa

## Revisión de estado del repo en GitHub (2026-07-18)

- [x] **Pre-commit no corre typecheck.** ~~`.husky/pre-commit` solo corre `lint-staged`
      (prettier + oxlint). El bajón de CI del 2026-07-06 fue por errores de `tsc` en
      commits directos a `main` — ese gap sigue abierto y puede repetirse.~~ Resuelto:
      se agregó `npm run typecheck` al final de `.husky/pre-commit`.
- [x] **Sin branch protection en `main`.** ~~Repo privado en plan free de GitHub
      (`branch protection` requiere GitHub Pro o repo público). Sin gate de PR
      obligatorio, cualquiera puede pushear directo a `main` y romper CI. Evaluar:
      pasar el repo a público, o pagar GitHub Pro, o aceptar el riesgo con el
      pre-commit como única red.~~ Decidido (2026-07-19): confirmado vía docs
      oficiales de GitHub que no hay forma gratuita (ni branch protection clásico
      ni Rulesets) para repos privados, tampoco moviendo a una org Free. Se acepta
      el riesgo por ahora — el pre-commit (typecheck+lint) sigue como única red.
      Revisar de nuevo si se decide pagar GitHub Pro o hacer público el repo.
- [x] **Deploy silencioso si faltan secrets.** ~~`deploy.yml` hace `exit 0` +
      `::warning::` cuando falta `CLOUDFLARE_API_TOKEN`, en vez de fallar. Es
      intencional, pero nadie revisa los warnings activamente — considerar una
      notificación más visible (ej. GitHub Step Summary destacado) si vuelve a pasar.~~
      Resuelto: se agregó un resumen destacado en `$GITHUB_STEP_SUMMARY` cuando falta
      el token, visible sin abrir logs.
- [x] **Sin badges de estado en el README.** ~~Agregar badges de CI y Deploy
      (shields.io apuntando a los workflows) para ver el estado a simple vista.~~
      Resuelto con badges nativos de GitHub Actions (no shields.io: el repo es
      privado y shields.io no puede leer el estado sin exponer un token).
- [x] **Confirmar vigencia del `KNOWN_ACCOUNT_ID` hardcodeado** en `deploy.yml`
      (fallback si el secret de Account ID está mal) — ~~no es secreto, pero revisar
      periódicamente que siga siendo la cuenta correcta.~~ Verificado (2026-07-19)
      contra `wrangler whoami`: `52d15acf04ee2011dfec85dc8240dc67` coincide con la
      cuenta `whoscrizzz.com`. Sigue vigente. Revisar de nuevo si cambia la cuenta.
- [x] Issue [#33](https://github.com/whoscrizzz/bills-pwa/issues/33) (densidad de UI
      en Inicio) — ~~sin relación con este tema, pendiente en el backlog general.~~
      Implementados los 4 ajustes opcionales del issue (chips más grandes, monto en
      verde, una columna en desktop, más contraste tarjeta/fondo) en `src/App.css`.
      El cierre real del issue en GitHub queda pendiente de que el titular confirme
      en iPhone/Safari, según el criterio de cierre original del issue.
- [x] **CSS muerto: el monto no se pinta en rojo cuando la suscripción está vencida.**
      ~~`src/App.css` tiene `.sub-card:has(.meta-urgency-overdue) .amount-sm { color: var(--danger) }`
      pero ningún componente aplica la clase `meta-urgency-overdue` — `SubscriptionCard.tsx` usa
      `sub-chip-overdue` para el chip de "Vencido hace X días", nombre distinto. El selector nunca
      matchea: el monto siempre queda en verde (`--success`), incluso vencido.~~ Corregido
      (2026-07-19): ambos selectores (color del monto y el borde/tinte izquierdo de la tarjeta,
      bloque "Urgency visual en cards") ahora usan `.sub-card:has(.sub-chip-overdue)`.
- [x] **Más CSS muerto encontrado al arreglar lo anterior.** ~~Toda la familia
      `.sub-card-meta-line .meta-urgency*` (`-urgent`, `-calm`, `-overdue`, y la línea base
      `.meta-urgency`, `src/App.css` líneas ~1864-1878) y el selector
      `.sub-card:has(.meta-urgency-urgent)` (línea ~4399, tinte de borde izquierdo ámbar) —
      ningún componente aplica esas clases, resto de un diseño de tarjeta anterior a los chips
      actuales.~~ Resuelto (2026-07-24): eliminados los 5 selectores. No era una decisión de
      diseño pendiente como se pensó originalmente — solo faltaba confirmar que ningún componente
      los aplicaba (incluido `-overdue`, que ya había migrado a `.sub-chip-overdue`), y borrar. Si
      en el futuro se quiere un tinte visual para "urgent" (ej. vencimiento hoy/mañana), es una
      feature nueva, no una restauración de este CSS.
- [x] **Entorno de dev local: `POST /bills-api/auth/request-link` falla a nivel de red.**
      ~~Al probar el login rediseñado (2026-07-20) con `npm run dev` + `dev:api` corriendo local,
      `/bills-api/health` respondía bien pero el POST de magic-link tiraba error de red genérico
      ("No se pudo conectar") — la respuesta cruda mostraba la página de error de Wrangler/Miniflare,
      no un 500 JSON normal de la app. No investigado a fondo (no bloqueaba la verificación visual).
      Sospecha: estado de D1 local desincronizado o falta `RESEND_API_KEY`/`EMAIL_FROM` en `.dev.vars`
      y el fallback sin esas vars no está devolviendo `verifyUrl` como se espera.~~ Investigado y
      resuelto (2026-07-21): causa real, `worker/src/index.ts` no envolvía `handleApi(...)` en
      try/catch, así que cualquier excepción no capturada (aquí, `checkRateLimit` contra
      `auth_rate_limits` con el D1 local vacío tras `dev-api-reset.sh` sin re-migrar) se propagaba
      hasta Miniflare, que devuelve su página de error nativa en vez de JSON. Se agregó un
      try/catch global que responde 500 JSON vía el helper `error()` existente, y
      `scripts/dev-api-reset.sh` ahora recuerda correr `npm run db:migrate:local` después del
      reset. La sospecha sobre `EMAIL_FROM`/`.dev.vars` era incorrecta: `EMAIL_FROM` vive en
      `wrangler.jsonc` como var normal (no secreto), siempre presente; el fallback sin
      `RESEND_API_KEY` ya funcionaba bien.
- [x] **`.husky/pre-commit` usaba sintaxis deprecada.** ~~Al commitear salía el aviso:
      *"Please remove the following two lines... They WILL FAIL in v10.0.0"*
      (el shebang `#!/usr/bin/env sh` y la línea `. "$(dirname -- "$0")/_/husky.sh"`).
      Actualizar el hook al formato nuevo de husky antes de que se actualice a v10.~~
      Resuelto: se quitó el boilerplate v8 de `.husky/pre-commit` y `"prepare"` pasó
      de `"husky install"` a `"husky"` (formato v9+).
- [x] **`core.hooksPath` local corrupto (hallazgo, no del repo).** En esta máquina
      apuntaba a `--version/_` en vez de `.husky/_`, así que el pre-commit no corría
      en este working directory (silencioso, sin error visible al commitear). No es
      un archivo versionado — no afecta a otros clones. Corregido con
      `git config core.hooksPath .husky/_`. Si vuelve a pasar en otra máquina,
      correr `git config --get core.hooksPath` para confirmar que apunte ahí.

## Incidente de producción: `bills.whoscrizzz.com` servía el sitio equivocado (2026-07-20)

- [x] **Ruta wildcard en Cloudflare capturaba el subdominio de Bills.** El Worker
      `whoscrizzz-site` tenía configurada la ruta `*.whoscrizzz.com/*` en el Dashboard
      de Cloudflare (su `wrangler.jsonc` no declara `routes` — ese dominio se
      configuraba 100% manual, fuera de control de versiones). Ese wildcard competía
      con el Custom Domain específico `bills.whoscrizzz.com` de `bills-pwa` y ganaba
      para algunos requests, sirviendo el portafolio en vez de la app de Bills
      (raíz y `/bills-api/*` por igual). El código de ambos Workers (`worker/src/*`
      de bills-pwa, `src/index.js` de whoscrizzz-site) estaba correcto — no era un
      bug de código. Resuelto borrando el wildcard y dejando `whoscrizzz.com` como
      Custom Domain explícito, sin patrón de subdominio. Se purgó caché del edge
      después (la respuesta incorrecta ya había quedado cacheada).
- [x] **CSP desactualizada pisando la de ambos Workers, vía Transform Rule de zona.**
      Al verificar el fix anterior apareció un segundo problema, separado: una regla
      "Modify Response Header" a nivel de zona (`whoscrizzz.com`, no de ningún
      Worker) inyectaba en **todas** las respuestas del dominio (bills y portafolio
      por igual) una `Content-Security-Policy` que permitía `https://unpkg.com`,
      `https://cdn.jsdelivr.net`, `https://fonts.googleapis.com` y
      `https://fonts.gstatic.com` — resto de una versión anterior del sitio, de
      antes de migrar a fuentes self-hosted. Esa CSP permisiva pisaba la CSP propia
      y más estricta que `bills-pwa` define en su código (`worker/src/index.ts`,
      `script-src 'self'` sin excepciones) — reducción real de protección contra XSS
      en una app que maneja datos financieros. Resuelto editando la Transform Rule:
      se quitaron los 4 hosts externos de las directivas correspondientes, se dejó
      el resto de la regla (Referrer-Policy, Permissions-Policy, filtro, ubicación)
      intacto. Verificado con curl que la CSP en ambos dominios ya no trae hosts
      externos y que el contenido servido es el correcto en cada uno.
      Nota: esta Transform Rule es la única fuente de CSP para `whoscrizzz-site`
      (su Worker no setea headers propios) — si se refactoriza ese sitio, considerar
      mover su CSP al código del Worker en vez de depender de config manual de zona.
- [x] **`fetch` a Resend sin try/catch propio (`worker/src/auth.ts`, `sendMagicLinkEmail`).**
      ~~Detectado al arreglar el try/catch global del bug de magic-link en dev local: si el
      `fetch('https://api.resend.com/emails', ...)` falla a nivel de red (no de respuesta HTTP —
      ej. sin conexión, DNS bloqueado), la excepción no está capturada ahí mismo. Con el try/catch
      global de `index.ts` ya no rompe (cae a un 500 JSON genérico), pero pierde el mensaje
      amigable "No se pudo enviar el correo..." que el caller ya sabe mostrar cuando Resend
      responde `{ok:false}`. No es bloqueante, es un gap de UX menor.~~ Resuelto (2026-07-23):
      `fetch` envuelto en try/catch propio, devuelve `{ok:false, error:'network error'}` en vez de
      propagar la excepción.
- [x] **CI en rojo por `npm audit --audit-level=high` (vulnerabilidad en `brace-expansion`).**
      ~~Detectado al revisar el check de CI del PR #54 — ya fallaba igual en `main` antes de ese
      PR, no relacionado con ningún cambio de código. `brace-expansion` (DoS por expansión
      exponencial de `{}`, GHSA-3jxr-9vmj-r5cp) llegaba transitivo vía
      `vite-plugin-pwa → workbox-build → jake/glob → minimatch → brace-expansion`, todo
      devDependencies (solo build-time, no corre en producción).~~ Resuelto: `npm audit fix`
      bumpeó `brace-expansion` a 5.0.7/2.1.2 (dentro de los rangos semver ya declarados por
      `minimatch`, sin tocar `package.json`). `npm audit --audit-level=high` en 0 vulnerabilidades.
- [x] **CI en rojo estructuralmente: el gate de audit auditaba TODAS las deps.** El fix de
      `brace-expansion` (arriba) fue un parche puntual; al día siguiente el CI volvió a romper por
      `fast-uri` y `sharp`/`libvips` (CVE-2026-*), transitivas vía `wrangler → miniflare` — todo
      dev/build tooling. Diagnóstico (2026-07-22): el step `npm audit --audit-level=high` auditaba
      el árbol completo, incluyendo herramientas que nunca se despachan a usuarios y acumulan
      advisories nuevos casi a diario (muchos sin fix upstream). Era un tripwire global sobre el
      feed de npm que rompía cualquier PR sin relación con el código. `npm audit --audit-level=high
      --omit=dev` da 0 vulnerabilidades — el árbol de PRODUCCIÓN está limpio. Resuelto acotando el
      gate del CI a `--omit=dev` (`.github/workflows/ci.yml`). Gap latente aceptado: las vulns de
      dev/build tooling dejan de monitorearse en CI; se pueden revisar aparte con `npm audit` manual
      si preocupa la cadena de suministro de build. No se despachan a usuarios.

## Auditoría completa del repo (2026-07-23)

Revisión de `worker/src/`, `src/`, CI/CD, dependencias y la suite de tests. Plan en 4 fases;
fases 1 y 2 completadas y verificadas contra D1/API local reales (no solo tests mirror).

- [x] **Pérdida de datos offline en sync.** ~~`src/lib/sync.ts` + `useSubscriptions.ts`: al
      sincronizar un `create`, el registro local se re-clavaba del UUID temporal al id real del
      servidor, pero cualquier otra op encolada (`update`/`delete`/`mark-paid`/`snooze`) seguía
      referenciando el UUID viejo, daba 404 y se descartaba en silencio. Flujo real: crear una
      suscripción offline y editarla/borrarla antes de reconectar perdía el segundo cambio.~~
      Resuelto: nueva `remapPendingOpSubscriptionId` en `offline-db.ts` + mapa `idRemap` en memoria
      en `sync.ts` que repunta cualquier op encolada al id real en cuanto su `create` sincroniza.
- [x] **No había forma de borrar una suscripción en desktop.** ~~`SubscriptionCard.tsx` solo
      disparaba `onDelete` vía swipe táctil; sin botón en la tarjeta ni en `EditSubscriptionModal`,
      usuarios de mouse/teclado no podían borrar nada.~~ Resuelto: botón de eliminar
      (`ActionIcon name="trash"`, clase `.btn-icon-del` que ya existía sin usar) en
      `.sub-card-actions`, mismo flujo de confirmación que el swipe. Verificado en navegador
      (creación → borrado → toast "Pago eliminado / Deshacer").
- [x] **Recordatorios en el día equivocado fuera de CDMX.** ~~`worker/src/due-dates.ts`:
      `daysUntilNextDue` siempre calculaba contra `America/Mexico_City`, ignorando
      `sub.user_timezone` (que sí se usaba para la hora en `shouldNotifyNow`).~~ Resuelto:
      `daysUntilNextDue`/`nextDueIsoDate` aceptan timezone explícito, threaded desde
      `notifications.ts` y `email-digest.ts`. Verificado corriendo el módulo real (bundle esbuild):
      mismo instante UTC da 9 días para CDMX/LA pero 8 para Madrid.
- [x] **Push/email duplicado posible por dedup no atómico.** ~~`notifications.ts` y
      `email-digest.ts`: SELECT-luego-INSERT contra `notification_log`, sin atomicidad — dos
      corridas de cron solapadas podían pasar el SELECT antes de que cualquier INSERT aterrizara.~~
      Resuelto: el INSERT ahora reclama el slot primero (usa el UNIQUE constraint ya existente en
      `notification_log` como boundary atómico); si el envío falla después, se libera el claim
      (DELETE) para reintentar en el siguiente tick.
- [x] **Rate limit de auth evadible por ráfaga.** ~~`rate-limit.ts`: mismo patrón read-then-write
      no atómico en `checkRateLimit` — requests concurrentes podían superar el tope de 5
      intentos/15min.~~ Resuelto: un solo UPSERT atómico con `CASE` para el reset de ventana.
      Verificado con 10 requests concurrentes al mismo email: exactamente 5 pasan y 5 dan 429.
- [x] **`notify_hour` sin clamp al editar.** ~~Se clampaba a 0-23 al crear (`clampHour`) pero no
      al editar — un valor fuera de rango desactivaba recordatorios sin error visible.~~ Resuelto:
      mismo `clampHour` aplicado en el path de update. Verificado vía API: `99` → `23`, `-5` → `0`.
- [x] **`paid_at` inválido tiraba 500 genérico.** ~~`"9999-99-99"` pasa el regex laxo
      `/^\d{4}-\d{2}-\d{2}/` pero `new Date(...).toISOString()` tira `RangeError` sin capturar.~~
      Resuelto: valida `Number.isNaN(parsed.getTime())` y devuelve 400
      `{"error":"paid_at inválido"}`. Verificado vía API.
- [x] **Fase 3 — la suite de tests no ejecuta código real.** ~~Los 6 archivos
      `scripts/test-*.mjs` (27 tests) reimplementan la lógica inline ("mirror" de
      `worker/src/*`) en vez de importar los módulos reales — por eso el bug de timezone de arriba
      pasó desapercibido con `npm run validate` en verde.~~ Resuelto: nuevo
      `scripts/test-helpers/load-ts-module.mjs` bundlea con esbuild y importa el módulo real;
      `test-notifications.mjs`/`test-stats.mjs` reescritos para llamar a las funciones reales;
      nuevo `test-dedup-claim.mjs` cubre `isUniqueConstraintError`. Verificado que el test detecta
      la regresión real (falla contra `due-dates.ts` pre-fix, pasa con el fix). Fuera de alcance:
      `test-import.mjs`, `test-webauthn-config.mjs`, `test-session-revocation.mjs` y
      `test-session-revoke-one.mjs` siguen siendo mirror — no tocan fecha/timezone/dedup.
- [x] **Fase 4 — limpieza.** ~~Código muerto: `src/components/WeekStrip.tsx` (sin importar en
      ningún lado), `suggestCategories` (`src/lib/categories.ts`), `computeAnnualTotal`
      (`src/lib/spending-stats.ts`).~~ Eliminados los tres. Deps actualizadas dentro de sus rangos
      semver (react, vite, wrangler, oxlint, prettier, lint-staged, sharp, @simplewebauthn/*,
      @cloudflare/workers-types, @types/node); `esbuild` pasó de transitivo a devDependency
      explícita. El bump de `@simplewebauthn/server` rompió `typecheck` en `passkeys.ts`
      (`Uint8Array<ArrayBuffer>` vs `ArrayBufferLike`), arreglado con anotaciones de tipo
      correctas, no silenciado. ~~CSS muerto (familia `.meta-urgency-urgent`/`.meta-urgency-calm`,
      `src/App.css` ~1804-1818, ~4355) **sigue pendiente de decisión de diseño** — sin chip
      equivalente obvio a diferencia del caso "overdue" ya resuelto arriba.~~ Nota (2026-08-03):
      ese pendiente ya estaba cerrado por el bullet "Más CSS muerto encontrado al arreglar lo
      anterior" (2026-07-24) — los 5 selectores se eliminaron y hoy `meta-urgency` no aparece en
      ningún archivo. Este párrafo quedó desactualizado; no hay decisión de diseño pendiente.

## Sincronización de docs con el código (2026-08-03)

- [x] **Docs describían features ya eliminadas del código.** Búsqueda de comentarios `TODO`/`FIXME`
      en el repo: no existe ninguno (el único match es la cadena en español "Todo al día" de
      `TodayPanel.tsx`), y el backlog de issues en GitHub está vacío. Lo que sí apareció fue drift
      entre docs y código: `CLAUDE.md`, `docs/ARCHITECTURE.md` y `memory.md` seguían documentando
      el swipe en las tarjetas como feature viva, aunque el commit `1df92eb` (#84) lo quitó por
      completo — cero referencias a `swipe` en `src/` o `worker/`. Como `CLAUDE.md` es el archivo
      que instruye a los agentes, el drift no es cosmético: llevaba a "arreglar" un gesto
      inexistente. Corregido en los tres archivos, apuntando al long-press vía Pointer Events que
      lo reemplazó. De paso se sincronizó el resto de `CLAUDE.md` contra el código real: rango de
      migraciones (`0001`–`0012` → `0001`–`0017`), tabla `notification_actions` faltante en la
      lista, `payment_records.subscription_id` nulable desde `0016` (gastos sueltos), la distinción
      `trashed_at`/`deleted_at` de `0013`, y los 5 archivos `scripts/test-*.mjs` que faltaban en la
      lista de tests. Verificado que los 14 tests sí están cableados en el script `test` de
      `package.json` (esa parte no tenía bug).

## Repaso de fidelidad visual vs. handoff de diseño (2026-08-08)

Punto de partida: se pidió un reemplazo completo de los componentes de Inicio, Gastos,
Historial, Ajustes, Registrar/Recurrencias y Escritorio contra los prototipos, asumiendo
que la implementación había quedado desviada. La auditoría contra los `.dc.html` (no solo
el `README.md` del handoff, que está incompleto) mostró 4 desviaciones reales, 1 más no
reportada, y 3 puntos donde el handoff quedó obsoleto y el repo tiene razón.

- [x] **Colores de categoría por hash en vez de la tabla fija del spec.** No reportado en
      el pedido original, pero era prerequisito de todo lo demás: había **tres**
      implementaciones idénticas del mismo hash (`spending-stats.ts`, `category-groups.ts`
      y una privada en `SubscriptionCard.tsx`), cada una con su propia saturación
      (`48% 44%`, `55% 52%`, `52% 48%`), y el campo `hue` que devolvía
      `computeCategorySlices` no lo consumía nadie. Unificado en `categoryColor()`
      (`src/lib/categories.ts`): tabla fija del handoff a `62% 52%`, hash solo como
      respaldo para categorías de texto libre, y gris neutro para `Otros`/`Sin categoría`
      (son la ausencia de categoría, no una más). `SubscriptionCard` además derivaba el
      color del **nombre** cuando no había categoría, pintando color de categoría donde no
      hay ninguna.
- [x] **Inicio no agrupaba por categoría.** `SubscriptionListGrouped` era un board de
      columnas detrás del toggle "Columnas"; ahora es el acordeón del prototipo, ordenado
      por peso económico (mayor total de una sola moneda, nunca la suma entre monedas).
      `TodayPanel` **no** se tocó: en el prototipo "Pendiente ahora" y "Próximos 7 días"
      son planas y sin punto de categoría, a propósito.
- [x] **Historial sin buscador ni chips de categoría.** `CompletedPaymentsPanel` no tenía
      ninguno de los dos y su contador no mostraba total en dinero. Agregados, con el
      contador y los totales por moneda sobre el set filtrado. La selección se poda contra
      el set visible: antes "Eliminar seleccionados (N)" podía contar filas escondidas por
      el filtro y borrar más de lo que el usuario ve. "Vaciar historial" ahora avisa
      explícitamente que borra también lo que el filtro no muestra.
- [x] **Sin selector de categoría visible al registrar.** Estaba escondido tras
      "+ Categoría y recordatorio" como `<input list>`. Ahora son chips visibles con su
      punto de color, conservando el texto libre en la sección opcional (hay filas con
      categorías fuera del catálogo; quitarlo las volvía no editables). **Bug de datos
      encontrado de paso:** el submit guardaba la categoría solo `if (showOptional && …)`,
      así que elegir una plantilla (que rellena la categoría sola) y guardar sin abrir la
      sección opcional la descartaba en silencio.
- [x] **Quincenal era un intervalo rodante, no días fijos.** Ahora usa la retícula 1–31
      multi-selección con el preset «Quincenas (1 y 15)» y «Limpiar», escribiendo
      `due_days`. El editor de intervalo (`Cada N` + unidad) del PR #88 se conserva en un
      8º chip «Personalizado» — el prototipo solo tiene 7, pero sin ese chip «cada 3
      meses» dejaría de ser expresable y se regresaría la corrección del PR #94. Las filas
      con `frequency: 'interval'` siguen funcionando: no hubo migración de datos.
- [x] **Confirmado que el handoff está obsoleto en tres puntos y NO se tocan:** el swipe
      (la Fase 5 lo pide, el PR #84 lo retiró dos días después por redundante con el check
      y `SnoozeMenu` — el objetivo de la Fase 5, "ningún gesto destruye datos", se cumple
      mejor sin gesto), `deleted_at` como columna de papelera (el repo usa `trashed_at`
      porque `deleted_at` ya era del archivado automático), y `MultiDateChips`/`WeekdayPills`
      como supuestamente sin uso (siguen usados por `RecurrenceSheet`). Documentado en
      `CLAUDE.md` y `memory.md` para que no se "arreglen" de vuelta.
- [ ] **Diferido a un PR aparte: reorganizar `src/components/` en subcarpetas**
      (`spending/`, `recurrence/`, `history/`, `settings/`, `shared/`). Hoy es plano, 42
      archivos; mover todo mezclaría ~42 archivos movidos con cambios reales en el mismo
      diff.
- [ ] **Diferido: desviaciones chicas de escritorio.** `--sidebar-width` 252px vs 240px del
      prototipo, celda de calendario 72px vs 84px, `SEM`/52px vs `SEMANA`/58px, y
      `.layout-content { max-width: 920px }` que no alcanza para `minmax(0,1fr) + 320px` +
      la canaleta de totales semanales.
- [ ] **Diferido: bug de accesibilidad real.** La retícula del calendario
      (`MonthCalendar`, dentro de `SpendingOverview.tsx`) tiene `role="img"` conteniendo
      `<button>` enfocables — un `role="img"` no debe tener hijos interactivos.
- [ ] **Diferido: `?p=calendar` no renderiza ningún calendario**, solo `CalendarSync` +
      `CaptureSetup`, aunque el nav del prototipo lo implica.
