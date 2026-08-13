#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Billzzz PWA — deploy a producción ==="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js no está instalado."
  echo "   Instala Node 24: https://nodejs.org/ o usa nvm: nvm install 24"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm no está instalado (viene con Node.js)."
  exit 1
fi

echo "→ Node $(node -v) | npm $(npm -v)"

if [[ ! -d node_modules ]] || [[ ! -x node_modules/.bin/wrangler ]]; then
  echo "→ Instalando dependencias (incluye Wrangler local, no hace falta instalarlo global)…"
  npm ci
fi

if ! npx wrangler --version >/dev/null 2>&1; then
  echo "❌ Wrangler no está en node_modules. Ejecuta: npm ci"
  exit 1
fi

echo "→ Wrangler $(npx wrangler --version 2>/dev/null | head -1)"

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo ""
  echo "❌ No estás autenticado en Cloudflare."
  echo ""
  echo "   Ejecuta primero (se abre el navegador):"
  echo "   npx wrangler login"
  echo ""
  echo "   Luego vuelve a correr:"
  echo "   ./scripts/deploy-production.sh"
  exit 1
fi

echo "→ Cloudflare: $(npx wrangler whoami 2>/dev/null | grep -i email || echo 'sesión OK')"
echo ""

echo "→ Validate (typecheck + lint + tests)"
npm run validate

echo "→ Build"
npm run build

echo "→ Migraciones D1 (remoto)"
npm run db:migrate:remote

echo "→ Deploy a https://billzzz.whoscrizzz.com"
npx wrangler deploy

echo "→ Smoke post-deploy"
npm run postdeploy:smoke

echo ""
echo "✅ Deploy listo."
echo ""
echo "   Comprueba: https://billzzz.whoscrizzz.com"
echo "   Si la PWA instalada no cambia, ciérrala por completo y ábrela de nuevo."
