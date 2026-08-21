#!/usr/bin/env bash
# Applies D1 migrations to production only after an explicit confirmation.
# This script is intentionally separate from deploy: code deploys must not
# modify production data as a side effect.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="bills-pwa-db"
DB_ID="83a5bcb0-9820-4612-8034-181ec5811e10"
CONFIRM_VALUE="${CONFIRM_D1_PROD_MIGRATION:-}"

echo "=== Billzzz D1 production migration ==="
echo "Database: ${DB_NAME}"
echo "Database ID: ${DB_ID}"
echo ""

if [[ "$CONFIRM_VALUE" != "$DB_NAME" ]]; then
  echo "❌ Migración bloqueada."
  echo ""
  echo "Para aplicar migraciones a producción, ejecuta explícitamente:"
  echo "  CONFIRM_D1_PROD_MIGRATION=${DB_NAME} npm run db:migrate:production"
  echo ""
  echo "Antes de hacerlo:"
  echo "  1. Confirma que estás en main y actualizado."
  echo "  2. Revisa los SQL en migrations/."
  echo "  3. Verifica que exista backup reciente o crea uno manual."
  echo "  4. Ten listo el rollback/restore documentado en docs/BACKUPS.md."
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
if [[ "$branch" != "main" && "${ALLOW_NON_MAIN_D1_MIGRATION:-}" != "1" ]]; then
  echo "❌ Estás en branch '${branch}', no en main."
  echo "   Si realmente necesitas migrar desde esta branch:"
  echo "   ALLOW_NON_MAIN_D1_MIGRATION=1 CONFIRM_D1_PROD_MIGRATION=${DB_NAME} npm run db:migrate:production"
  exit 1
fi

echo "→ Validando proyecto antes de tocar D1"
npm run validate

echo "→ Migraciones pendientes/aplicadas (remoto)"
npx wrangler d1 migrations list "$DB_NAME" --remote || true
echo ""

echo "→ Aplicando migraciones D1 a producción"
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "→ Smoke post-migration"
npm run postdeploy:smoke

echo ""
echo "✅ Migraciones aplicadas a ${DB_NAME}."
