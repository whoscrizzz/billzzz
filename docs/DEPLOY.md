# Deploy a producción (billzzz.whoscrizzz.com)

## Arreglar CI / deploy automático (1 minuto)

El workflow fallaba porque **faltan o están mal pegados los secrets en GitHub** (error `6111` = token con comillas, espacios o contraseña de login en vez de API Token). Desde tu Mac:

Flujo completo:

```bash
gh auth login
./scripts/setup-github-secrets.sh
```

Te pide el **API token** (plantilla «Edit Cloudflare Workers») y el **Account ID** (`npx wrangler whoami` lo muestra), los guarda sin espacios/comillas y lanza el deploy.

Alternativa manual: [secrets en GitHub](#3-secrets-en-github) (Opción B abajo).

Tras configurarlos, cada push a `main` despliega solo. Si faltan secrets, el workflow **no falla en rojo** — omite el deploy con un aviso.

---

## ¿Por qué falló GitHub Actions antes?

El workflow **Deploy to Cloudflare** instala Wrangler solo (`npm ci`). **No necesitas Wrangler global en tu Mac** para que CI funcione.

Lo que falló fue esto:

```
CLOUDFLARE_API_TOKEN environment variable ... necessary
```

Es decir: faltan los **secrets de Cloudflare en GitHub**, no Wrangler en tu computadora.

---

## ¿Necesito instalar Wrangler?

**No globalmente.** El proyecto ya incluye Wrangler en `devDependencies`.

Después de `npm ci`, usa siempre:

```bash
npx wrangler login
npx wrangler deploy
```

O el script todo-en-uno:

```bash
./scripts/deploy-production.sh
```

---

## Opción A — Deploy desde tu Mac (recomendado la primera vez)

### 1. Requisitos

- [Node.js 24](https://nodejs.org/) (o `nvm install 24 && nvm use`)
- Acceso a la cuenta Cloudflare donde está `billzzz.whoscrizzz.com`
- Repo clonado:

```bash
git clone https://github.com/whoscrizzz/billzzz-pwa.git
cd billzzz-pwa
```

### 2. Instalar dependencias (incluye Wrangler)

```bash
npm ci
```

Verifica que Wrangler está disponible:

```bash
npx wrangler --version
# debe mostrar 4.x
```

### 3. Iniciar sesión en Cloudflare (solo una vez)

```bash
npx wrangler login
```

Se abre el navegador → elige la cuenta correcta → autoriza.

Comprueba:

```bash
npx wrangler whoami
```

### 4. Publicar

```bash
git pull origin main
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

El script hace en orden:

1. `npm run validate` (typecheck + lint + tests — el gate completo, no solo tests)
2. `npm run build`
3. `npm run db:migrate:remote` (migraciones D1, p. ej. passkeys)
4. `npx wrangler deploy` (Worker + assets a Cloudflare — directo, sin pasar por `npm run deploy`, que ya incluye su propio `build` y lo duplicaría)
5. `npm run postdeploy:smoke` (verifica `/` y `/bills-api/health` en prod)

### 5. Comprobar

- Abre <https://billzzz.whoscrizzz.com> — fondo **gris claro** `#eef1f5`
- API: <https://billzzz.whoscrizzz.com/bills-api/health>

Si la **PWA instalada** no cambia: cierra la app por completo y ábrela de nuevo, o borra datos del sitio en Safari.

---

## Opción B — GitHub Actions (sin Wrangler en tu Mac)

Configura una sola vez; luego cada push a `main` despliega solo.

### 1. Crear token en Cloudflare

1. <https://dash.cloudflare.com/profile/api-tokens>
2. **Create Token** → plantilla **Edit Cloudflare Workers**
3. **Continue** → **Create Token**
4. Copia el token (solo se muestra una vez)

### 2. Account ID

1. <https://dash.cloudflare.com>
2. **Workers & Pages**
3. Copia **Account ID** (columna derecha)

### 3. Secrets en GitHub

<https://github.com/whoscrizzz/billzzz-pwa/settings/secrets/actions> → **New repository secret**

| Nombre | Valor |
| -------- | -------- |
| `CLOUDFLARE_API_TOKEN` | token del paso 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID del paso 2 |

### 4. Ejecutar deploy

<https://github.com/whoscrizzz/billzzz-pwa/actions/workflows/deploy.yml>

→ **Run workflow** → branch `main` → **Run workflow**

Debe salir **verde**. Si sale rojo, abre el log del paso que falló.

---

## Opción C — Cloudflare Workers Builds (Git nativo, sin GitHub Actions)

Cloudflare clona el repo y despliega él mismo en cada push — no pasa por GitHub
Actions ni necesita `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` como secret
de GitHub (la autorización es una GitHub App que instala Cloudflare, vía
OAuth). Esto **solo se configura desde el dashboard de Cloudflare** — no hay
forma de hacerlo por CLI/API.

### 1. Conectar el repo

1. <https://dash.cloudflare.com> → **Workers & Pages** → el Worker `billzzz-pwa`
2. Pestaña **Settings** → **Build** (o **Builds**, según la versión del dashboard)
3. **Connect to Git** → autoriza la GitHub App → elige `whoscrizzz/billzzz-pwa`
4. Production branch: `main`

### 2. Comandos de build/deploy

Reusa exactamente el pipeline de `npm run deploy:safe` (`package.json`), partido
en los campos que expone el dashboard:

| Campo | Valor |
| ------- | ------- |
| Build command | `npm run validate && npm run build` |
| Deploy command | `npm run db:migrate:remote && npx wrangler deploy && npm run postdeploy:smoke` |
| Root directory | `/` (raíz del repo) |
| Non-production branch deploys | Off — este repo no usa preview deploys, y un preview desplegaría un Worker aparte sin dominio propio |

Si el dashboard solo expone un campo único de deploy (versiones más nuevas separan
build/deploy, otras no), pega todo el pipeline ahí en una sola línea:
`npm run validate && npm run build && npm run db:migrate:remote && npx wrangler deploy && npm run postdeploy:smoke`.

### 3. Variables y secretos

- Las `vars` de `wrangler.jsonc` (`VAPID_PUBLIC_KEY`, `APP_URL`, etc.) ya viajan
  con el repo — Workers Builds no necesita que las dupliques.
- Los secretos (`VAPID_PRIVATE_KEY`, `RESEND_API_KEY`) **no cambian**: siguen
  puestos con `wrangler secret put` como hasta ahora, independientes de qué
  mecanismo de CI dispare el deploy.

### 4. Evitar doble deploy

`.github/workflows/deploy.yml` (Opción B) y Workers Builds (Opción C) son dos
mecanismos independientes — si dejas los dos activos, cada push a `main`
desplegaría dos veces. **No lo desactives hasta confirmar que Workers Builds
completó un deploy verde de punta a punta** (build, migración D1, deploy,
smoke); si algo del dashboard falla a mitad de la migración, `deploy.yml`
sigue siendo el respaldo con el que producción no se queda sin forma de
desplegar. Una vez confirmado, desactiva el workflow (`Settings` → `Actions`
→ deshabilitar, o borrar `.github/workflows/deploy.yml` en un PR aparte) en
vez de dejarlo compitiendo en silencio.

---

## Comandos útiles (con `npx`, sin instalar global)

| Comando | Qué hace |
| --------- | ---------- |
| `./scripts/setup-github-secrets.sh` | Configura secrets en GitHub + lanza deploy |
| `npx wrangler whoami` | ¿Estoy logueado? (muestra Account ID) |
| `npx wrangler login` | Login OAuth (Mac) |
| `npm run deploy` | Build + deploy |
| `npm run db:migrate:remote` | Migraciones D1 en prod |
| `./scripts/deploy-production.sh` | Todo el flujo de prod |

---

## Errores frecuentes

| Error | Causa | Solución |
| ------- | -------- | ---------- |
| `wrangler: command not found` | No usaste `npx` y no hay `npm ci` | `npm ci` y luego `npx wrangler ...` |
| `CLOUDFLARE_API_TOKEN ... necessary` | CI sin secrets | Opción B arriba |
| `Not authenticated` en Mac | Sin login | `npx wrangler login` |
| Sigue viendo tema viejo | Cache PWA | Cerrar app / borrar datos del sitio |
| Migración falla | Token sin permiso D1 | Token con **Edit Cloudflare Workers** |
