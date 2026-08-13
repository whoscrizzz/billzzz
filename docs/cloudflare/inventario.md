# Cloudflare — inventario Billzzz
# Cloudflare — inventario Billzzz

Fuente de verdad para bindings, puertos, cron y rango de migraciones: [memory.md](../../memory.md).
`wrangler.jsonc` es la fuente de verdad del propio Worker; actualiza `memory.md` si cambian bindings o rutas.

## Worker

| Campo | Valor |
| ------- | ------- |
| Nombre | `billzzz-pwa` |
| Nombre | `billzzz-pwa` |
| Entry | `worker/src/index.ts` |
| Dominio | `billzzz.whoscrizzz.com` (custom domain) |
| Dominio | `billzzz.whoscrizzz.com` (custom domain) |

## Secretos (no en repo)

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put RESEND_API_KEY
```

Local: copiar `.dev.vars.example` → `.dev.vars`.

## Deploy — dos mecanismos posibles (no usar los dos a la vez)

### GitHub Actions (`.github/workflows/deploy.yml`)

| Secret | Uso |
| -------- | ----- |
| `CLOUDFLARE_API_TOKEN` | Deploy (Edit Cloudflare Workers) |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy |

Setup: `./scripts/setup-github-secrets.sh`

### Cloudflare Workers Builds (Git nativo, dashboard-only)

Alternativa sin secrets de GitHub — Cloudflare clona y despliega directo vía
GitHub App. Setup y comandos exactos: `docs/DEPLOY.md` § Opción C.

## Health check

`GET https://bills.whoscrizzz.com/bills-api/health` → 200
