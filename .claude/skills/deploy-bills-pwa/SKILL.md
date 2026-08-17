---
name: deploy-billzzz-pwa
description: Deploy billzzz-pwa to production.
---

## Hard rule

**No deploy without explicit sign-off from Cristofer**, per `AGENTS.md` → "Prohibido sin OK explícito" and `CLAUDE.md` → "Operational rules". This applies even though `deploy`/`deploy:safe` work and are one command away — the assistant gives the exact command, Cristofer runs it.

## Pre-deploy checklist

1. `git status` — working tree limpio, rama con PR mergeado (no push directo a `main`).
2. `npm run validate` — typecheck + lint + tests (ver skill `validate-bills-pwa`). No proponer deploy si esto falla.
3. Si la rama tocó `migrations/*.sql`: confirmar que son forward-only y que no eliminan tablas/columnas sin OK explícito (`AGENTS.md` → prohibido eliminar funcionalidades o migraciones sin OK).
4. Si la rama tocó `wrangler.jsonc` bindings: confirmar que `npm run cf-typegen` corrió y `worker/src/env.ts` sigue alineado con `Env`.
5. `npm run cf:preflight` — solo lectura: wrangler whoami, deployments, estado de migraciones D1 remoto, smoke HTTP. Seguro de correr sin permiso.

## Deploy

El deploy lo corre Cristofer, no el asistente. Dos formas equivalentes (mismo flujo: validate → build → D1 migrate remoto → deploy → smoke) — dar el comando exacto y esperar confirmación:

```bash
npm run deploy:safe
```

o el script equivalente documentado en `docs/DEPLOY.md`:

```bash
./scripts/deploy-production.sh
```

No usar `npm run deploy` (build + wrangler deploy, sin migrar ni gate de validate) salvo que Cristofer lo pida explícitamente sabiendo que se salta el resto del flujo.

## Post-deploy

`deploy:safe` ya corre `postdeploy:smoke` al final (`/`, `/billzzz-api/health`, `/manifest.webmanifest`). Si se usó `deploy` a secas, correr manualmente:

```bash
npm run postdeploy:smoke
```

## Nunca sin OK explícito adicional

DNS, rutas, bindings, secretos de producción — ver `AGENTS.md`. Esto es aparte del OK de deploy en sí.
