# Deploy a producción (bills.whoscrizzz.com)

## Arreglar CI / deploy automático (1 minuto)

El workflow fallaba porque **faltan secrets en GitHub**. Desde tu Mac:

```bash
gh auth login
./scripts/setup-github-secrets.sh
```

Te pide el **API token** y el **Account ID** de Cloudflare, los guarda en GitHub y lanza el deploy.

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
- Acceso a la cuenta Cloudflare donde está `bills.whoscrizzz.com`
- Repo clonado:

```bash
git clone https://github.com/whoscrizzz/bills-pwa.git
cd bills-pwa
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

1. `npm test`
2. `npm run build`
3. `npm run db:migrate:remote` (migraciones D1, p. ej. passkeys)
4. `npm run deploy` (Worker + assets a Cloudflare)

### 5. Comprobar

- Abre https://bills.whoscrizzz.com — fondo **gris claro** `#eef1f5`
- API: https://bills.whoscrizzz.com/bills-api/health

Si la **PWA instalada** no cambia: cierra la app por completo y ábrela de nuevo, o borra datos del sitio en Safari.

---

## Opción B — GitHub Actions (sin Wrangler en tu Mac)

Configura una sola vez; luego cada push a `main` despliega solo.

### 1. Crear token en Cloudflare

1. https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → plantilla **Edit Cloudflare Workers**
3. **Continue** → **Create Token**
4. Copia el token (solo se muestra una vez)

### 2. Account ID

1. https://dash.cloudflare.com
2. **Workers & Pages**
3. Copia **Account ID** (columna derecha)

### 3. Secrets en GitHub

https://github.com/whoscrizzz/bills-pwa/settings/secrets/actions → **New repository secret**

| Nombre | Valor |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | token del paso 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID del paso 2 |

### 4. Ejecutar deploy

https://github.com/whoscrizzz/bills-pwa/actions/workflows/deploy.yml

→ **Run workflow** → branch `main` → **Run workflow**

Debe salir **verde**. Si sale rojo, abre el log del paso que falló.

---

## Comandos útiles (con `npx`, sin instalar global)

| Comando | Qué hace |
|---------|----------|
| `./scripts/setup-github-secrets.sh` | Configura secrets en GitHub + lanza deploy |
| `npx wrangler whoami` | ¿Estoy logueado? (muestra Account ID) |
| `npx wrangler login` | Login OAuth (Mac) |
| `npm run deploy` | Build + deploy |
| `npm run db:migrate:remote` | Migraciones D1 en prod |
| `./scripts/deploy-production.sh` | Todo el flujo de prod |

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `wrangler: command not found` | No usaste `npx` y no hay `npm ci` | `npm ci` y luego `npx wrangler ...` |
| `CLOUDFLARE_API_TOKEN ... necessary` | CI sin secrets | Opción B arriba |
| `Not authenticated` en Mac | Sin login | `npx wrangler login` |
| Sigue viendo tema viejo | Cache PWA | Cerrar app / borrar datos del sitio |
| Migración falla | Token sin permiso D1 | Token con **Edit Cloudflare Workers** |

---

## Qué hay en producción vs `main`

Tras mergear PR #7, `main` incluye tema gris + mobile UX. Hasta que corras deploy (A o B), producción puede seguir en beige `#ebcda8`.
