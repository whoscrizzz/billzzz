#!/usr/bin/env bash
# Sesión Wrangler, deployments, D1 y smoke HTTP de billzzz.whoscrizzz.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Wrangler identity =="
npx wrangler whoami || { echo "Run: npx wrangler login"; exit 1; }

echo ""
echo "== Worker deployments =="
npx wrangler deployments list 2>/dev/null | head -20 || true

echo ""
echo "== D1 migrations (remote status) =="
npx wrangler d1 migrations list bills-pwa-db --remote 2>/dev/null | tail -15 || true

echo ""
echo "== HTTP smoke (browser-like) =="
curl -sI -A "Mozilla/5.0" -o /dev/null -w "billzzz.whoscrizzz.com/ → %{http_code}\n" https://billzzz.whoscrizzz.com/ || true
curl -sI -A "Mozilla/5.0" -o /dev/null -w "billzzz-api/health → %{http_code}\n" https://billzzz.whoscrizzz.com/billzzz-api/health || true
# Stage 2: bills-api was retired. 200 here is expected (SPA fallback, not_found_handling
# in wrangler.jsonc) — what matters is content-type, not status. GET, not -I/HEAD: a HEAD
# request against this exact URL hit a stale edge-cached content-type from before the
# cutover (cf-cache-status: HIT on the JSON response) while GET already revalidated.
curl -s -A "Mozilla/5.0" -o /dev/null -w "bills-api/health → %{http_code}, %{content_type} (debe NO ser application/json — confirma que el prefijo viejo quedó retirado)\n" https://billzzz.whoscrizzz.com/bills-api/health || true

echo ""
echo "Done. Local dev: npm run dev:api (8787) + npm run dev (5173)."
