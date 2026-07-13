#!/usr/bin/env bash
# Configura secrets de Cloudflare en GitHub y lanza deploy a producción.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${GITHUB_REPOSITORY:-whoscrizzz/bills-pwa}"

echo "=== Configurar deploy automático (GitHub Actions → Cloudflare) ==="
echo ""
echo "IMPORTANTE — NO uses tu contraseña de login de Cloudflare."
echo "  • CLOUDFLARE_API_TOKEN = Custom token con Workers Edit + D1 Edit (ver abajo)"
echo "  • CLOUDFLARE_ACCOUNT_ID = ve con: npx wrangler whoami"
echo ""
echo "La plantilla «Edit Cloudflare Workers» NO incluye D1 — el deploy falla con error 7403."
echo "Custom token → permisos: Workers Scripts Edit, Workers Routes Edit, D1 Edit, Account Settings Read"
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Instala GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ No estás logueado en GitHub. Ejecuta:"
  echo "   gh auth login"
  exit 1
fi

echo "Repo: $REPO"
echo ""

is_valid_account_id() {
  [[ "$1" =~ ^[a-f0-9]{32}$ ]]
}

read_wrangler_account_id() {
  if ! command -v npx >/dev/null 2>&1 || ! npx wrangler whoami >/dev/null 2>&1; then
    return 1
  fi
  npx wrangler whoami 2>/dev/null | grep -oE '[a-f0-9]{32}' | head -1
}

sanitize() {
  local value="$1"
  value="$(printf '%s' "$value" | tr -d '\r\n')"
  value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  value="$(printf '%s' "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  printf '%s' "$value"
}

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "1) Token API Cloudflare (NO es tu contraseña de la web):"
  echo "   https://dash.cloudflare.com/profile/api-tokens"
  echo "   → Create Token → plantilla «Edit Cloudflare Workers» → Create Token"
  echo "   → copia el token largo (solo se muestra una vez)"
  read -rsp "CLOUDFLARE_API_TOKEN: " CLOUDFLARE_API_TOKEN
  echo ""
fi

CLOUDFLARE_API_TOKEN="$(sanitize "$CLOUDFLARE_API_TOKEN")"

if [[ ${#CLOUDFLARE_API_TOKEN} -lt 30 ]]; then
  echo "❌ El token parece demasiado corto. ¿Pegaste la contraseña de login?"
  echo "   Crea un API Token en el enlace de arriba (cadena larga, sin espacios ni comillas)."
  exit 1
fi

if printf '%s' "$CLOUDFLARE_API_TOKEN" | grep -q '[[:space:]]'; then
  echo "❌ El token contiene espacios. Pégalo de nuevo sin comillas ni saltos de línea."
  exit 1
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  DETECTED_ID="$(read_wrangler_account_id || true)"
  echo ""
  echo "2) Account ID (32 caracteres, sin espacios):"
  if [[ -n "$DETECTED_ID" ]]; then
    echo "   Detectado con wrangler whoami: $DETECTED_ID"
    read -rp "CLOUDFLARE_ACCOUNT_ID [Enter = usar detectado]: " CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$DETECTED_ID}"
  else
    echo "   https://dash.cloudflare.com → Workers & Pages → Account ID (panel derecho)"
    echo "   O ejecuta: npx wrangler whoami"
    read -rp "CLOUDFLARE_ACCOUNT_ID: " CLOUDFLARE_ACCOUNT_ID
  fi
fi

CLOUDFLARE_ACCOUNT_ID="$(echo "$CLOUDFLARE_ACCOUNT_ID" | tr -d '[:space:]')"

if ! is_valid_account_id "$CLOUDFLARE_ACCOUNT_ID"; then
  echo ""
  echo "❌ Account ID inválido: «$CLOUDFLARE_ACCOUNT_ID»"
  echo "   Debe ser exactamente 32 caracteres hex (0-9, a-f)."
  echo "   Ejecuta en tu Mac:  npx wrangler whoami"
  echo "   y copia la columna Account ID completa (no escribas «x» ni letras sueltas)."
  exit 1
fi

echo ""
echo "→ Guardando secrets en GitHub…"
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN" --repo "$REPO"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID" --repo "$REPO"

echo "✅ Secrets configurados."
echo ""
echo "→ Lanzando deploy a main…"
gh workflow run deploy.yml --ref main --repo "$REPO"

echo ""
echo "Sigue el progreso:"
echo "  gh run list --workflow=deploy.yml --repo $REPO"
echo "  https://github.com/$REPO/actions/workflows/deploy.yml"
echo ""
echo "Producción: https://bills.whoscrizzz.com"
