#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "No estás autenticado en Cloudflare."
  echo "Ejecuta: npx wrangler login"
  exit 1
fi

echo "→ Tests"
npm test

echo "→ Build"
npm run build

echo "→ Migraciones D1 (remoto)"
npm run db:migrate:remote

echo "→ Deploy a bills.whoscrizzz.com"
npm run deploy

echo ""
echo "Listo. Si la PWA sigue en negro, cierra la app y ábrela de nuevo"
echo "o borra datos del sitio en Safari/Chrome para forzar el CSS nuevo."
