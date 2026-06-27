#!/usr/bin/env bash
# Configura secrets de Cloudflare en GitHub y lanza deploy a producción.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${GITHUB_REPOSITORY:-whoscrizzz/bills-pwa}"

echo "=== Configurar deploy automático (GitHub Actions → Cloudflare) ==="
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

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Token Cloudflare (plantilla «Edit Cloudflare Workers»):"
  echo "  https://dash.cloudflare.com/profile/api-tokens"
  read -rsp "CLOUDFLARE_API_TOKEN: " CLOUDFLARE_API_TOKEN
  echo ""
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo ""
  echo "Account ID (panel derecho en Workers & Pages):"
  echo "  https://dash.cloudflare.com → Workers & Pages"
  if command -v npx >/dev/null 2>&1 && npx wrangler whoami >/dev/null 2>&1; then
    echo ""
    echo "Detectado wrangler login — copiando Account ID de whoami:"
    npx wrangler whoami 2>/dev/null | grep -i "account id" || true
  fi
  read -rp "CLOUDFLARE_ACCOUNT_ID: " CLOUDFLARE_ACCOUNT_ID
fi

if [[ -z "$CLOUDFLARE_API_TOKEN" || -z "$CLOUDFLARE_ACCOUNT_ID" ]]; then
  echo "❌ Token y Account ID son obligatorios."
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
