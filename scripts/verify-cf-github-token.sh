#!/usr/bin/env bash
# Prueba un API Token de Cloudflare y, si es válido, lo guarda en GitHub Actions.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${GITHUB_REPOSITORY:-whoscrizzz/bills-pwa}"

source scripts/sanitize-cf-secret.sh

echo "=== Verificar y guardar CLOUDFLARE_API_TOKEN en GitHub ==="
echo ""
echo "Crea un token CUSTOM (la plantilla «Edit Cloudflare Workers» NO incluye D1):"
echo "  https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom token"
echo ""
echo "Permisos mínimos (Account → whoscrizzz.com):"
echo "  • Workers Scripts — Edit"
echo "  • Workers Routes — Edit"
echo "  • D1 — Edit          ← obligatorio (sin esto falla con error 7403)"
echo "  • Account Settings — Read"
echo ""
echo "NO uses tu contraseña de login. Pega el token largo SIN comillas."
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Instala GitHub CLI: brew install gh && gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ Ejecuta: gh auth login"
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  read -rsp "CLOUDFLARE_API_TOKEN: " CLOUDFLARE_API_TOKEN
  echo ""
fi

CLOUDFLARE_API_TOKEN="$(sanitize "$CLOUDFLARE_API_TOKEN")"

if [[ ${#CLOUDFLARE_API_TOKEN} -lt 30 ]]; then
  echo "❌ Token demasiado corto. Usa un API Token, no la contraseña de Cloudflare."
  exit 1
fi

if printf '%s' "$CLOUDFLARE_API_TOKEN" | grep -q '[[:space:]]'; then
  echo "❌ El token tiene espacios. Pégalo de nuevo sin comillas ni saltos de línea."
  exit 1
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  read -rp "CLOUDFLARE_ACCOUNT_ID (dashboard Cloudflare, columna derecha): " CLOUDFLARE_ACCOUNT_ID
fi
KNOWN_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

echo "→ Probando token con wrangler whoami…"
if ! WHOAMI="$(npx wrangler whoami 2>&1)"; then
  echo "❌ Cloudflare rechazó el token:"
  echo ""
  echo "$WHOAMI"
  echo ""
  echo "Causas comunes:"
  echo "  • Pegaste la contraseña de login en vez del API Token"
  echo "  • Token revocado o con permisos insuficientes (necesita Workers + D1)"
  echo "  • Comillas o espacios al copiar"
  exit 1
fi

echo "$WHOAMI" | head -8
echo ""

echo "→ Probando acceso D1 (migraciones)…"
if ! D1_TEST="$(npx wrangler d1 migrations list DB --remote 2>&1)"; then
  echo "❌ El token no puede acceder a D1 (error 7403 = falta permiso D1 Edit):"
  echo ""
  echo "$D1_TEST" | tail -8
  echo ""
  echo "Crea un Custom Token con permiso «D1 — Edit» además de Workers."
  exit 1
fi

echo "✅ Token válido (Workers + D1)."
echo ""
read -rp "¿Guardar en GitHub ($REPO) y lanzar deploy? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  echo "Cancelado. Para guardar manualmente:"
  echo "  gh secret set CLOUDFLARE_API_TOKEN --repo $REPO"
  exit 0
fi

gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN" --repo "$REPO"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$KNOWN_ACCOUNT_ID" --repo "$REPO"

echo "✅ Secrets actualizados."
echo "→ Lanzando deploy…"
gh workflow run deploy.yml --ref main --repo "$REPO"
echo ""
echo "Sigue el progreso:"
echo "  gh run watch --repo $REPO \$(gh run list --workflow=deploy.yml --repo $REPO --limit 1 --json databaseId -q '.[0].databaseId')"
