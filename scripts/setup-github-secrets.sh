#!/usr/bin/env bash
# Configura secrets de Cloudflare en GitHub y lanza deploy a producción.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${GITHUB_REPOSITORY:-whoscrizzz/bills-pwa}"

echo "=== Configurar deploy automático (GitHub Actions → Cloudflare) ==="
echo ""
echo "IMPORTANTE — NO uses tu contraseña de login de Cloudflare, ni la plantilla"
echo "«Edit Cloudflare Workers» (no incluye D1 ni R2 — el deploy falla con 7403"
echo "y el backup no puede subir a R2)."
echo ""
echo "  • CLOUDFLARE_API_TOKEN = Custom token, ver permisos abajo"
echo "  • CLOUDFLARE_ACCOUNT_ID = ve con: npx wrangler whoami"
echo ""
echo "https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom token"
echo "Permisos (cuenta whoscrizzz.com):"
echo "  • Workers Scripts — Edit"
echo "  • Workers Routes — Edit"
echo "  • D1 — Edit                  ← obligatorio (sin esto falla con error 7403)"
echo "  • Account Settings — Read"
echo "  • Workers R2 Storage — Edit  ← necesario para el backup semanal (backup-d1.yml)"
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
  echo "   → Create Token → Custom token (los permisos exactos están arriba)"
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

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

echo ""
echo "→ Probando el token contra Cloudflare antes de guardar nada (evita otro"
echo "  round-trip fallido descubierto recién en el log de GitHub Actions)…"
if ! WHOAMI="$(npx wrangler whoami 2>&1)"; then
  echo "❌ Cloudflare rechazó el token (no se guardó nada en GitHub):"
  echo ""
  echo "$WHOAMI"
  echo ""
  echo "Causas comunes: pegaste la contraseña de login en vez del API Token,"
  echo "el token está revocado, o quedó con comillas/espacios al copiar."
  exit 1
fi
echo "$WHOAMI" | head -8
echo ""

echo "→ Probando acceso a D1…"
if ! D1_TEST="$(npx wrangler d1 migrations list bills-pwa-db --remote 2>&1)"; then
  echo "❌ El token es válido pero no tiene acceso a D1 (falta permiso «D1 — Edit»):"
  echo ""
  echo "$D1_TEST" | tail -8
  exit 1
fi
echo "✅ Token válido, con acceso a D1."
echo ""

echo "→ Guardando secrets en GitHub…"
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN" --repo "$REPO"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID" --repo "$REPO"

echo "✅ Secrets configurados (probados, no a ciegas)."
echo ""
echo "→ Lanzando deploy a main…"
gh workflow run deploy.yml --ref main --repo "$REPO"

echo ""
echo "Sigue el progreso:"
echo "  gh run list --workflow=deploy.yml --repo $REPO"
echo "  https://github.com/$REPO/actions/workflows/deploy.yml"
echo ""
echo "Producción: https://bills.whoscrizzz.com"
