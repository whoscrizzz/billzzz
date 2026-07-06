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
Cron hourly   → push notifications + email digests
```

## Bindings (wrangler.jsonc)

| Binding | Recurso |
|---------|---------|
| `DB` | D1 `bills-pwa-db` (`83a5bcb0-9820-4612-8034-181ec5811e10`) |
| `ASSETS` | `dist/` (SPA fallback) |

**Vars (no secretas):** `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `APP_URL`, `EMAIL_FROM`, `APP_VERSION`

**Secretos (Cloudflare / `.dev.vars`):** `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`

## Puertos locales

| Puerto | Servicio |
|--------|----------|
| 8787 | Worker (`npm run dev:api`, proxy target de Vite) |
| 5173 | Vite dev server (`npm run dev`) |

## UI: web vs móvil / PWA instalada

Una sola SPA. Breakpoint **768px**:

| | Desktop | Móvil / PWA |
|---|---------|-------------|
| Nav | Sidebar fija | Bottom nav |
| Lista inicio | Usuario elige vista plana o por categoría (`localStorage`) | Misma preferencia (toggle visible) |
| Registro rápido | Tab Registrar / sidebar | FAB en Inicio + bottom nav |
| Gestos | Hover | Swipe tarjeta (pagado / eliminar) |

PWA: manifest generado en build (`vite.config.ts`); `start_url` `/?pwa=1`. Login en standalone usa pegar enlace / portapapeles ([src/lib/pwa.ts](src/lib/pwa.ts)).

Navegación interna: `/?p=home|add|calendar|settings` ([src/lib/nav-route.ts](src/lib/nav-route.ts)).

## Offline

IndexedDB guarda suscripciones y cola `pendingOps`. Sincroniza al volver online: crear/editar/borrar, **marcar pagado**, **posponer**, **restaurar archivado**. Ver [src/lib/sync.ts](src/lib/sync.ts).

## Notificaciones push

`notify_hour` en suscripción = hora local **Ciudad de México** (worker [timezone.ts](worker/src/timezone.ts)). Cron UTC compara hora MX.

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

Detalle: `docs/DEPLOY.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`.
