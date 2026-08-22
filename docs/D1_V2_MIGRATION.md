# Migración D1 v2

Runbook para crear `bills-pwa-db-v2`, ensayar la transformación y hacer el corte sin modificar la D1 v1. Todos los comandos remotos de esta guía los ejecuta el titular desde su terminal.

Fuentes oficiales: [migraciones](https://developers.cloudflare.com/d1/reference/migrations/), [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) y [comandos Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/).

## 1. Estado del repositorio

- `migrations-v1/`: historia congelada de `bills-pwa-db`.
- `migrations/0001_v2_baseline.sql`: historia limpia de `bills-pwa-db-v2`.
- `wrangler.jsonc` sigue ligado a v1 y a `migrations-v1/` hasta el cutover.
- `.d1-cutover/` está ignorado por Git; guarda ahí exports, SQLite, reportes y SQL de importación.

Antes de cualquier operación remota:

```bash
npm run validate
mkdir -p .d1-cutover
npx wrangler whoami
```

## 2. Auditoría agregada de v1

Solo devuelve conteos, agregados, violaciones e índices; no selecciona PII.

```bash
npx wrangler d1 execute bills-pwa-db --remote --file=scripts/audit-d1-v1.sql
```

El cutover se bloquea si hay huérfanos, JSON/fechas inválidas, moneda distinta de MXN/USD o archivo y papelera simultáneos que no puedan repararse determinísticamente.

## 3. Crear y preparar D1 v2

```bash
npx wrangler d1 create bills-pwa-db-v2
npx wrangler d1 execute bills-pwa-db-v2 --remote --file=migrations/0001_v2_baseline.sql
npx wrangler d1 execute bills-pwa-db-v2 --remote --file=scripts/verify-d1-v2.sql
```

Guarda el `database_id` devuelto. No reemplaces todavía el binding de producción.

## 4. Ensayo con un export reciente

El export remoto bloquea temporalmente consultas a esa D1; haz el ensayo fuera de hora pico. En el corte real, mantenimiento debe estar activo antes del export.

```bash
npx wrangler d1 export bills-pwa-db --remote --output=.d1-cutover/v1-rehearsal.sql
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in .d1-cutover/v1-rehearsal.sql \
  -out .d1-cutover/v1-rehearsal.sql.enc
node scripts/transform-d1-v1-to-v2.mjs \
  --source-sql .d1-cutover/v1-rehearsal.sql \
  --target .d1-cutover/v2-rehearsal.sqlite \
  --report .d1-cutover/v2-rehearsal-report.json \
  --output-sql .d1-cutover/v2-rehearsal-import.sql \
  --as-of "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

El script termina con código `2` y no produce un import válido si hay rechazos. El reporte no contiene PII: identifica filas con hashes cortos.

Para un ensayo remoto repetible, crea otra D1 temporal, aplica el baseline y después el import generado:

```bash
npx wrangler d1 create bills-pwa-db-v2-rehearsal
npx wrangler d1 execute bills-pwa-db-v2-rehearsal --remote --file=migrations/0001_v2_baseline.sql
npx wrangler d1 execute bills-pwa-db-v2-rehearsal --remote --file=.d1-cutover/v2-rehearsal-import.sql
npx wrangler d1 execute bills-pwa-db-v2-rehearsal --remote --file=scripts/verify-d1-v2.sql
```

Copia `wrangler.jsonc` a `.d1-cutover/wrangler.v2-staging.jsonc`, cambia nombre del Worker, elimina `routes`, apunta `DB` al ID temporal y usa `migrations_dir: "migrations"`. Luego el titular ejecuta:

```bash
npx wrangler deploy --config=.d1-cutover/wrangler.v2-staging.jsonc
```

Prueba rutas PWA/Worker, captura, pagos, undo, export/import, notificaciones y el health check. El health debe devolver `db_schema_version: 2`.

## 5. Cutover

### 5.1 Congelar escrituras

Añade temporalmente `"MAINTENANCE_MODE": "true"` a `vars` en `wrangler.jsonc`, todavía con el binding v1. El titular despliega y verifica:

```bash
npm run validate
npx wrangler deploy
curl -i https://billzzz.whoscrizzz.com/billzzz-api/subscriptions
curl -s https://billzzz.whoscrizzz.com/billzzz-api/health
```

La API debe responder `503` y `Retry-After: 300`; health sigue disponible y el cron queda detenido.

### 5.2 Bookmark, export cifrado y transformación final

```bash
npx wrangler d1 time-travel info bills-pwa-db
npx wrangler d1 export bills-pwa-db --remote --output=.d1-cutover/v1-cutover.sql
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in .d1-cutover/v1-cutover.sql \
  -out .d1-cutover/v1-cutover.sql.enc
node scripts/transform-d1-v1-to-v2.mjs \
  --source-sql .d1-cutover/v1-cutover.sql \
  --target .d1-cutover/v2-cutover.sqlite \
  --report .d1-cutover/v2-cutover-report.json \
  --output-sql .d1-cutover/v2-cutover-import.sql \
  --as-of "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Anota el bookmark fuera del repositorio. Conserva el `.enc`; elimina el SQL plano cuando termine la reconciliación.

### 5.3 Importar y reconciliar v2

La D1 final debe estar vacía salvo por el baseline. Si el ensayo usó `bills-pwa-db-v2`, crea una D1 final nueva o restáurala antes; nunca importes dos veces.

```bash
npx wrangler d1 execute bills-pwa-db-v2 --remote --file=.d1-cutover/v2-cutover-import.sql
npx wrangler d1 execute bills-pwa-db-v2 --remote --file=scripts/verify-d1-v2.sql
```

Compara el resultado remoto con `v2-cutover-report.json`:

1. Cero filas en `foreign_key_check`.
2. `integrity_check = ok`.
3. Conteos reconciliados considerando la retención de auth/logs.
4. Sumas por moneda idénticas a `SUM(round(v1.amount * 100))`.
5. Planes con índices y sin `USE TEMP B-TREE` en consultas calientes.
6. Cero rechazos.

### 5.4 Cambiar binding y probar en mantenimiento

En `wrangler.jsonc`, cambia `database_name`, `database_id` y `migrations_dir` a v2/`migrations`; conserva `MAINTENANCE_MODE=true`. Regenera tipos y el titular despliega:

```bash
npm run cf-typegen
npm run validate
npx wrangler deploy
curl -s https://billzzz.whoscrizzz.com/billzzz-api/health
```

Ejecuta smokes de lectura, auth y activos. Las rutas mutantes seguirán bloqueadas por mantenimiento.

### 5.5 Reabrir

Elimina `MAINTENANCE_MODE`, valida y el titular despliega:

```bash
npm run validate
npx wrangler deploy
npm run postdeploy:smoke
```

Confirma inmediatamente un ciclo controlado de crear/editar/pagar/undo y que la suma histórica no cambió.

## 6. Rollback

Si algo falla antes de reabrir escrituras:

1. Mantén `MAINTENANCE_MODE=true`.
2. Revierte en `wrangler.jsonc` el binding a `bills-pwa-db` y `migrations_dir` a `migrations-v1`.
3. El titular despliega, ejecuta smoke y solo entonces retira mantenimiento.

No hace falta restaurar v1 porque quedó congelada. Si v1 hubiera sido modificada accidentalmente, el bookmark permite una restauración destructiva explícita:

```bash
npx wrangler d1 time-travel restore bills-pwa-db --bookmark=BOOKMARK_GUARDADO
```

No uses este rollback después de reabrir sin reconciliar primero las nuevas escrituras de v2.

## 7. Retención de v1

Conserva `bills-pwa-db` sin bindings de escritura durante 30 días. No borres la D1, exports ni bookmarks como parte de este PR. La eliminación será una operación posterior, separada y con aprobación explícita.
