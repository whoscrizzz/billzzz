#!/usr/bin/env bash
# Genera la clave de cifrado de los backups de D1 y la guarda en GitHub.
# Correr UNA sola vez (o para rotar la clave — ver docs/BACKUPS.md).
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${GITHUB_REPOSITORY:-whoscrizzz/bills-pwa}"

echo "=== Configurar cifrado de backups (BACKUP_ENCRYPTION_KEY) ==="
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Instala GitHub CLI: brew install gh && gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ Ejecuta: gh auth login"
  exit 1
fi

if gh secret list --repo "$REPO" 2>/dev/null | grep -q '^BACKUP_ENCRYPTION_KEY'; then
  echo "⚠️  Ya existe un BACKUP_ENCRYPTION_KEY en $REPO."
  echo "   Rotarlo invalida los backups viejos (no vas a poder desencriptarlos"
  echo "   con la clave nueva). Si igual querés rotar, borrá el secret primero:"
  echo "     gh secret remove BACKUP_ENCRYPTION_KEY --repo $REPO"
  echo "   y volvé a correr este script."
  exit 1
fi

KEY="$(openssl rand -base64 32)"

echo "Clave generada. GUARDALA AHORA en tu gestor de contraseñas (1Password, etc.)"
echo "fuera de GitHub. Si la perdés y perdés el repo, los backups son irrecuperables:"
echo ""
echo "  $KEY"
echo ""
read -rp "¿Ya la guardaste en un lugar seguro? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  echo "Cancelado. No se guardó nada en GitHub. Volvé a correr el script cuando la hayas guardado."
  exit 0
fi

gh secret set BACKUP_ENCRYPTION_KEY --body "$KEY" --repo "$REPO"

echo ""
echo "✅ BACKUP_ENCRYPTION_KEY configurado en $REPO."
echo ""
echo "Chequeos que faltan antes de que el backup automático funcione (ver docs/BACKUPS.md):"
echo "  1. Bucket R2 creado:        npx wrangler r2 bucket create bills-pwa-backups"
echo "  2. Token con permiso R2:    agregar «Workers R2 Storage — Edit» al CLOUDFLARE_API_TOKEN existente"
echo "  3. Probar manual:           gh workflow run backup-d1.yml --ref main --repo $REPO"
