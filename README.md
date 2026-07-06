# Bills PWA

PWA para gestionar suscripciones, fechas de pago, recordatorios y sincronización offline. Backend en Cloudflare Workers + D1.

Producción: https://bills.whoscrizzz.com

## Requisitos

- Node.js 24 (ver `.nvmrc`; 22+ también suele funcionar)
- Cuenta de Cloudflare con acceso al worker y la base D1 existente

**No instales Wrangler globalmente.** Tras `npm ci` úsalo con `npx wrangler` (viene en `devDependencies`).

Guía completa de deploy: **[docs/DEPLOY.md](docs/DEPLOY.md)**

## Clonar en otro Mac

El repositorio es **privado**. No hace falta SSH: HTTPS funciona bien.

```bash
git clone https://github.com/whoscrizzz/bills-pwa.git
cd bills-pwa
nvm use          # o: fnm use / volta pin node@24
npm ci
cp .dev.vars.example .dev.vars
# Edita .dev.vars con los secretos (ver abajo)
npx wrangler login
npm run db:migrate:local
```

### Autenticación con GitHub (HTTPS)

Al clonar o hacer `git push`, Git pedirá credenciales:

- **Usuario:** tu usuario de GitHub
- **Contraseña:** un [Personal Access Token](https://github.com/settings/tokens) con permiso `repo` (no uses la contraseña de la cuenta)

Para no escribir el token en cada operación, instala [GitHub CLI](https://cli.github.com/) y ejecuta:

```bash
brew install gh
gh auth login
```

Elige **HTTPS** y autentícate en el navegador.

### SSH (opcional)

SSH no es necesario. Si más adelante quieres usarlo, configura una clave en [GitHub → SSH keys](https://github.com/settings/keys) y clona con:

```bash
git clone git@github.com:whoscrizzz/bills-pwa.git
```

## Secretos

Los secretos **no** van en el repo. Configúralos así:

**Desarrollo local** — archivo `.dev.vars`:

```env
VAPID_PRIVATE_KEY=...
RESEND_API_KEY=...
```

**Producción** — ya configurados en Cloudflare; si hace falta reconfigurarlos:

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put RESEND_API_KEY
```

La clave pública VAPID y el resto de vars no secretas están en `wrangler.jsonc`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Frontend Vite (proxy API → `:8787`) |
| `npm run dev:api` | Worker local en `http://127.0.0.1:8787` |
| `npm run dev:api:reset` | Reinicio limpio del worker (puerto 8787) |
| `npm run dev:full` | Build + worker local (SPA + API en 8787) |
| `npm run build` | Build de producción |
| `npm run validate` | typecheck + lint + tests (gate antes de PR) |
| `npm run deploy` | Build + deploy a Cloudflare |
| `npm run deploy:safe` | validate + build + migrate + deploy + smoke |
| `npm run cf:preflight` | Auditoría Wrangler + smoke HTTP |
| `npm run postdeploy:smoke` | Comprueba `/` y `/bills-api/health` en prod |
| `npm run cf-typegen` | Genera tipos Wrangler tras cambiar bindings |
| `./scripts/verify-cf-github-token.sh` | Prueba API token y lo guarda en GitHub |
| `npm run db:migrate:local` | Migraciones D1 locales |
| `npm run db:migrate:remote` | Migraciones D1 en producción |
| `npm test` | Tests de stats, import, notifications, webauthn |
| `./scripts/deploy-production.sh` | Tests + build + migrate + deploy (prod) |
| `./scripts/apply-handoff-mac.sh` | En Mac: pull `main`, resolver conflictos, `npm ci`, validate, build |

## Desarrollo

Terminal 1 — API (puerto **8787**):

```bash
npm run dev:api
```

Terminal 2 — frontend (puerto **5173**, proxy API → 8787):

```bash
npm run dev
```

Abre `http://127.0.0.1:5173`. Si el worker falla con SQLITE_BUSY: `npm run dev:api:reset`.

O todo junto:

```bash
npm run dev:full
```

## Deploy

**Resumen:** no necesitas `npm install -g wrangler`. Solo Node + `npm ci` + `npx wrangler login`.

Detalle paso a paso → **[docs/DEPLOY.md](docs/DEPLOY.md)**

### Opción A — desde tu Mac (rápido)

```bash
git pull origin main
npm ci
npx wrangler login          # solo la primera vez — abre el navegador
./scripts/deploy-production.sh
```

### Opción B — GitHub Actions (sin Wrangler en tu Mac)

El workflow **sí instala Wrangler** en el runner. Lo que falló antes fueron los **secrets vacíos**, no Wrangler.

1. Token: [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Edit Cloudflare Workers**
2. Account ID: [Cloudflare dashboard](https://dash.cloudflare.com) → Workers & Pages (panel derecho)
3. Secrets: [GitHub → bills-pwa → Actions secrets](https://github.com/whoscrizzz/bills-pwa/settings/secrets/actions)
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. [Run workflow](https://github.com/whoscrizzz/bills-pwa/actions/workflows/deploy.yml) → branch `main`

### Después del deploy

Si la app instalada sigue con el tema viejo, la PWA cacheó CSS:

- **iPhone:** cierra Bills por completo y vuelve a abrir; si no, Safari → borrar historial del sitio.
- **Chrome:** borrar datos del sitio o unregister service worker.

La base D1 remota (`bills-pwa-db`) y el dominio ya están en `wrangler.jsonc`.
