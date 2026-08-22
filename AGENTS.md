# billzzz-pwa — agent notes

**Alcance:** PWA de suscripciones en `billzzz.whoscrizzz.com`. Repo canónico: `~/Projects/billzzz`.

## Arquitectura

- **Un solo Worker** (`wrangler.jsonc`): SPA desde `dist/` + API en `/billzzz-api/*` + cron horario (push + email).
- **Frontend:** Vite + React en `src/`, PWA con Workbox.
- **Backend:** TypeScript en `worker/src/`, D1 binding `DB`.
- **No es monorepo** de dos workers.

Puertos, bindings, cron y rango de migraciones: fuente única en [memory.md](memory.md) — no repetir esos datos aquí.

Para correr varios worktrees/checkouts en paralelo sin choque de puertos, define
`VITE_PORT` y `VITE_API_PORT` en un `.env.local` (gitignored) de cada uno — los
defaults compartidos no se tocan. Antes de asignar un puerto nuevo,
revisa los `.env.local` de los demás worktrees activos para no repetir uno ya
en uso (`git worktree list` + `cat .claude/worktrees/*/.env.local`).

Local solo `127.0.0.1`. Sin túneles Cloudflare, sin Zero Trust, sin dev expuesto por IP.

## Comandos esenciales

| Comando | Función |
| --------- | --------- |
| `npm run validate` | typecheck + oxlint + tests (gate antes de PR/deploy) |
| `npm run dev:api` | Worker en `http://127.0.0.1:8787` |
| `npm run dev` | Vite en `:5173` (proxy `/billzzz-api` → 8787) |
| `npm run dev:full` | Build + worker único (SPA + API en 8787) |
| `npm run dev:api:reset` | Mata :8787, limpia `.wrangler/state`, reinicia |
| `npm run cf-typegen` | `wrangler types` tras cambiar bindings |
| `npm run cf:preflight` | whoami, deployments, D1, smoke HTTP |
| `npm run deploy:safe` | validate + build + deploy + smoke; no aplica migraciones D1 |
| `./scripts/deploy-production.sh` | Deploy manual desde Mac; no modifica D1 |
| `npm run db:migrate:production` | Migración D1 prod manual con confirmación explícita |

## Secretos

Nombres y dónde viven: [memory.md](memory.md). **Nunca** commitear `.dev.vars`, `.env`, ni valores reales. Vars no secretas en `wrangler.jsonc`.

Tras editar `wrangler.jsonc` bindings: `npm run cf-typegen` y alinear `worker/src/env.ts` si cambió `Env`.

## Git y deploy

- Un cambio = una rama + PR. No push directo de experimentos a `main`.
- `npm run validate` antes de PR.
- **Deploy solo** con permiso explícito del titular.
- No deployar desde agentes sin OK explícito.

## Prohibido sin OK explícito

- Deploy a Cloudflare
- Cambiar DNS, rutas, bindings o secretos en producción
- Eliminar funcionalidades o migraciones
- Añadir API keys de LLM al runtime

## Docs

- `README.md` — setup y scripts
- `docs/DEPLOY.md` — deploy Mac + GitHub Actions
- `docs/cloudflare/inventario.md` — bindings e IDs
- `memory.md` — estado operativo
