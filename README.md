# Bills PWA

PWA para gestionar suscripciones, fechas de pago, recordatorios y sincronización offline. Backend en Cloudflare Workers + D1.

Producción: https://bills.whoscrizzz.com

## Requisitos

- Node.js 22+ (ver `.nvmrc`)
- Cuenta de Cloudflare con acceso al worker y la base D1 existente
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (incluido como dependencia del proyecto)

## Clonar en otro Mac

```bash
git clone git@github.com:whoscrizzz/bills-pwa.git
cd bills-pwa
nvm use          # o: fnm use / volta pin node@22
npm ci
cp .dev.vars.example .dev.vars
# Edita .dev.vars con los secretos (ver abajo)
wrangler login
npm run db:migrate:local
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
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put RESEND_API_KEY
```

La clave pública VAPID y el resto de vars no secretas están en `wrangler.jsonc`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Frontend Vite (proxy API → `:8787`) |
| `npm run dev:api` | Worker local con Wrangler |
| `npm run dev:full` | Build + worker local (SPA + API) |
| `npm run build` | Build de producción |
| `npm run deploy` | Build + deploy a Cloudflare |
| `npm run db:migrate:local` | Migraciones D1 locales |
| `npm run db:migrate:remote` | Migraciones D1 en producción |
| `npm test` | Tests de stats e import |

## Desarrollo

Terminal 1 — API:

```bash
npm run dev:api
```

Terminal 2 — frontend:

```bash
npm run dev
```

O todo junto:

```bash
npm run dev:full
```

## Deploy

```bash
npm run deploy
```

La base D1 remota (`bills-pwa-db`) y el dominio ya están definidos en `wrangler.jsonc`. Solo necesitas estar autenticado con `wrangler login` en la cuenta correcta.
