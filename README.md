# Bills PWA

PWA para gestionar suscripciones, fechas de pago, recordatorios y sincronización offline. Backend en Cloudflare Workers + D1.

Producción: https://bills.whoscrizzz.com

## Requisitos

- Node.js 24 (ver `.nvmrc`; 22+ también suele funcionar)
- Cuenta de Cloudflare con acceso al worker y la base D1 existente
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (incluido como dependencia del proyecto)

## Clonar en otro Mac

El repositorio es **privado**. No hace falta SSH: HTTPS funciona bien.

```bash
git clone https://github.com/whoscrizzz/bills-pwa.git
cd bills-pwa
nvm use          # o: fnm use / volta pin node@24
npm ci
cp .dev.vars.example .dev.vars
# Edita .dev.vars con los secretos (ver abajo)
wrangler login
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
