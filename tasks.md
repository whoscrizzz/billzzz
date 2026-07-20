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
- [ ] **Más CSS muerto encontrado al arreglar lo anterior:** toda la familia
      `.sub-card-meta-line .meta-urgency*` (`-urgent`, `-calm`, y la línea base `.meta-urgency`,
      `src/App.css` líneas ~1804-1818) y el selector `.sub-card:has(.meta-urgency-urgent)` (línea
      ~4355, tinte de borde izquierdo ámbar) — ningún componente aplica esas clases, parecen resto
      de un diseño de tarjeta anterior a los chips actuales. No se tocó: a diferencia del caso
      "overdue", no hay un chip equivalente obvio para "urgent" (¿`sub-chip-today`? ¿`sub-chip-soon`?)
      y es una decisión de diseño, no un fix mecánico de nombre de clase.
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
