# bills-pwa — memoria técnica

Estado operativo del PWA. No es changelog de sesión.

## Ubicaciones

| Qué | Ruta |
|-----|------|
| Repo canónico | `~/Projects/bills-pwa` |
| GitHub | `https://github.com/whoscrizzz/bills-pwa.git` (privado) |
| Producción | `https://bills.whoscrizzz.com` |

## Runtime

```text
Browser → bills.whoscrizzz.com/*
  /bills-api/* → Worker handler (D1, auth, push, email)
  /*           → ASSETS (SPA desde dist/)
Cron */15 min → push notifications + email digests + purga de filas auth vencidas
```

## Bindings (wrangler.jsonc)

| Binding | Recurso |
|---------|---------|
| `DB` | D1 `bills-pwa-db` (`83a5bcb0-9820-4612-8034-181ec5811e10`) |
| `ASSETS` | `dist/` (SPA fallback) |

**Vars (no secretas):** `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `APP_URL`, `EMAIL_FROM`, `APP_VERSION`, `API_VERSION` (declarada, hoy sin uso en las rutas)

**Secretos (Cloudflare / `.dev.vars`):** `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`

## Puertos locales

| Puerto (default) | Servicio | Override |
|--------|----------|----------|
| 8787 | Worker (`npm run dev:api`, proxy target de Vite) | env var `VITE_API_PORT` |
| 5173 | Vite dev server (`npm run dev`) | env var `VITE_PORT` |

Para correr varios worktrees/proyectos en paralelo sin choque de puertos, define `VITE_PORT` y `VITE_API_PORT` en un `.env.local` (gitignored) de cada checkout — no se tocan los defaults compartidos.

## UI: web vs móvil / PWA instalada

Una sola SPA. Breakpoint **768px**:

| | Desktop | Móvil / PWA |
|---|---------|-------------|
| Nav | Sidebar fija | Bottom nav |
| Lista inicio | Usuario elige vista plana o por categoría (`localStorage`) | Misma preferencia (toggle visible) |
| Registro rápido | Tab Registrar / sidebar | FAB en Inicio + bottom nav |
| Gestos | Hover + long-press | Long-press en la tarjeta abre posponer (sin swipe) |

PWA: manifest generado en build (`vite.config.ts`); `start_url` `/?pwa=1`. Login en standalone usa pegar enlace / portapapeles ([src/lib/pwa.ts](src/lib/pwa.ts)).

Navegación interna: `/?p=home|add|calendar|settings` ([src/lib/nav-route.ts](src/lib/nav-route.ts)).

## Offline

IndexedDB guarda suscripciones y cola `pendingOps`. Sincroniza al volver online: crear/editar/borrar, **marcar pagado**, **posponer**, **restaurar archivado**. Ver [src/lib/sync.ts](src/lib/sync.ts).

## Notificaciones push

`notify_hour` en suscripción = hora local de la **zona horaria del usuario** (`users.timezone`, default `America/Mexico_City`; lista permitida en worker [timezone.ts](worker/src/timezone.ts) y su copia en [src/lib/notify-timezone.ts](src/lib/notify-timezone.ts) — mantener ambas en sync). El cron corre cada 15 min y sólo envía dentro de la ventana `[notify_hour, notify_hour+1)`; el dedup reclama la clave en `notification_log` antes de enviar y la libera si falla la entrega.

## Comandos

| Comando | Función |
|---------|---------|
| `npm run validate` | Gate: typecheck + lint + tests |
| `npm run dev:api` + `npm run dev` | Dev dual (API + frontend) |
| `npm run deploy:safe` | validate → build → migrate → deploy → smoke |
| `npm run cf:preflight` | Auditoría Wrangler + HTTP |
| `npm run postdeploy:smoke` | `/`, `/bills-api/health`, manifest |

## CI

- `ci.yml` — validate + build en PR/push a `main`
- `deploy.yml` — validate + build + migrate + deploy + smoke (si secrets CF en GitHub)

## Gotchas conocidos

- **Dependabot: 5 alertas abiertas de `undici`** (1 high, 4 moderate), llegan vía `wrangler → miniflare → undici@7.28.0` (devDependency, solo corre en `wrangler dev` local). `npm audit --audit-level=high --omit=dev` (el chequeo real de CI) da 0 — no afecta producción. Sin fix disponible: `wrangler@4.119.0` sigue pineando `undici@7.28.0` en su `miniflare`. Revisar de nuevo cuando se actualice `wrangler` y confirmar si ya trae `undici@7.29.0+`.

## Rediseño (handoff de diseño)

Fases 0–8 **cerradas** y en producción desde 2026-08-04. El paquete de diseño
vive en `design_handoff_bills_redesign/` (gitignored, "material de diseño, no es
código"); los `.dc.html` son la fuente de verdad visual — su `README.md` está
incompleto para varias pantallas.

El handoff es un snapshot del 2026-07-31 y quedó **obsoleto en tres puntos** que
no hay que "arreglar" de vuelta: el swipe (retirado a propósito en el PR #84),
`deleted_at` como columna de papelera (el repo usa `trashed_at`, correcto), y su
lista de componentes supuestamente sin uso (`MultiDateChips`/`WeekdayPills`
siguen en uso). Ver CLAUDE.md § Conventions para el detalle.

Repaso de fidelidad 2026-08-08: acordeón por categoría en Inicio, buscador +
chips en Historial, chips de categoría al registrar, Quincenal por `due_days`
con preset «Quincenas (1 y 15)», y `categoryColor()` como única fuente de color
por categoría. Diferido a otro PR: reorganizar `src/components/` en subcarpetas
(hoy plano, 42 archivos), desviaciones chicas de escritorio (`--sidebar-width`
252 vs 240px, celda de calendario 72 vs 84px, `SEM` vs `SEMANA`,
`.layout-content` con `max-width: 920px` que no alcanza para `1fr + 320px`), el
`role="img"` con botones dentro en la retícula del calendario, y que
`?p=calendar` no renderiza ningún calendario.

Detalle: `docs/DEPLOY.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`.

Handoff para nuevo chat (agente): `docs/handoff/2026-07-06-pr31-cursor-chat.md`.
