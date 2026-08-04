# Cloudflare — inventario bills-pwa

Fuente de verdad: `wrangler.jsonc`. Actualizar este doc si cambian bindings o rutas.

## Worker

| Campo | Valor |
|-------|-------|
| Nombre | `bills-pwa` |
| Entry | `worker/src/index.ts` |
| Dominio | `bills.whoscrizzz.com` (custom domain) |
| Cron | `0 * * * *` (cada hora) |

## Bindings

| Binding | Tipo | Recurso |
|---------|------|---------|
| `DB` | D1 | `bills-pwa-db` — id `83a5bcb0-9820-4612-8034-181ec5811e10` |
| `ASSETS` | Assets | directorio `dist/` |

Migraciones: `migrations/` (0001–0008).

## Variables (wrangler.jsonc `vars`)

- `VAPID_PUBLIC_KEY` — clave pública Web Push
- `VAPID_SUBJECT` — mailto del titular
- `APP_URL` — `https://bills.whoscrizzz.com`
- `EMAIL_FROM` — remitente Resend

## Secretos (no en repo)

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put RESEND_API_KEY
```

Local: copiar `.dev.vars.example` → `.dev.vars`.

## Deploy — dos mecanismos posibles (no usar los dos a la vez)

### GitHub Actions (`.github/workflows/deploy.yml`)

| Secret | Uso |
|--------|-----|
| `CLOUDFLARE_API_TOKEN` | Deploy (Edit Cloudflare Workers) |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy |

Setup: `./scripts/setup-github-secrets.sh`

### Cloudflare Workers Builds (Git nativo, dashboard-only)

Alternativa sin secrets de GitHub — Cloudflare clona y despliega directo vía
GitHub App. Setup y comandos exactos: `docs/DEPLOY.md` § Opción C.

## Health check

`GET https://bills.whoscrizzz.com/bills-api/health` → 200
