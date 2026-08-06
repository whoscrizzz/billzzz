#!/usr/bin/env bash
# Descarga, descifra y (opcionalmente) restaura un backup de D1 desde R2.
# Requiere: wrangler autenticado localmente (CLOUDFLARE_API_TOKEN/ACCOUNT_ID en env,
# o haber corrido `npx wrangler login`) y BACKUP_ENCRYPTION_KEY en env.
#
# Uso:
#   scripts/restore-d1-backup.sh --list
#   scripts/restore-d1-backup.sh --file bills-pwa-20260802T040001Z.sql.gz.enc
#   scripts/restore-d1-backup.sh --file <archivo> --apply-to bills-pwa-db-restore-test
set -euo pipefail

cd "$(dirname "$0")/.."
BUCKET="bills-pwa-backups"

if [[ "${1:-}" == "--list" ]]; then
  echo "→ Backups disponibles en R2 (más reciente primero):"
  npx wrangler r2 object list "$BUCKET" --json 2>/dev/null \
    | node -e "
        const raw = require('fs').readFileSync(0, 'utf8');
        const data = JSON.parse(raw);
        const objs = Array.isArray(data) ? data : (data.result || data.objects || []);
        objs
          .sort((a, b) => (b.uploaded || b.lastModified || '').localeCompare(a.uploaded || a.lastModified || ''))
          .forEach(o => console.log(o.key || o.name));
      " \
    || echo "  (no se pudo listar — tu versión de wrangler puede no soportar 'r2 object list'. Revisá el bucket desde el dashboard de Cloudflare.)"
  exit 0
fi

FILE=""
APPLY_TO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --apply-to) APPLY_TO="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

if [[ -z "$FILE" ]]; then
  echo "Uso: $0 --list"
  echo "     $0 --file <nombre-en-r2> [--apply-to <nombre-db-d1>]"
  exit 1
fi

if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  read -rsp "BACKUP_ENCRYPTION_KEY: " BACKUP_ENCRYPTION_KEY
  echo ""
fi
export BACKUP_ENCRYPTION_KEY

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Descargando $FILE de R2…"
npx wrangler r2 object get "$BUCKET/$FILE" --file="$TMP/backup.enc" --remote

echo "→ Descifrando…"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$TMP/backup.enc" -out "$TMP/backup.sql.gz" \
  -pass env:BACKUP_ENCRYPTION_KEY

echo "→ Descomprimiendo…"
gunzip -k "$TMP/backup.sql.gz"

OUT="./restored-$(basename "$FILE" .sql.gz.enc).sql"
cp "$TMP/backup.sql" "$OUT"
echo "✅ SQL restaurado en: $OUT"
echo "   ($(wc -l < "$OUT") líneas)"

if [[ -z "$APPLY_TO" ]]; then
  echo ""
  echo "No se aplicó a ninguna base — esto fue solo descarga + descifrado."
  echo "Para aplicarlo a una base de prueba (NUNCA directo a bills-pwa-db en producción):"
  echo "  npx wrangler d1 create bills-pwa-db-restore-test"
  echo "  $0 --file $FILE --apply-to bills-pwa-db-restore-test"
  exit 0
fi

if [[ "$APPLY_TO" == "bills-pwa-db" ]]; then
  echo ""
  echo "❌ Por seguridad este script no aplica directo a bills-pwa-db (production)."
  echo "   Restaurá a una base de prueba primero, verificá los datos a mano, y si"
  echo "   hace falta reemplazar producción hacelo manualmente y con cuidado:"
  echo "     npx wrangler d1 execute bills-pwa-db --remote --file=$OUT"
  exit 1
fi

echo "→ Aplicando a $APPLY_TO…"
npx wrangler d1 execute "$APPLY_TO" --remote --file="$OUT"
echo "✅ Restaurado en $APPLY_TO. Verificá los datos antes de usarlo para nada más."
