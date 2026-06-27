#!/usr/bin/env bash
# Reinicio limpio del worker local — evita SQLITE_BUSY por procesos duplicados en :8787
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Deteniendo wrangler/workerd en 8787 (si hay)…"
for pid in $(lsof -t -iTCP:8787 -sTCP:LISTEN 2>/dev/null || true); do
  kill "$pid" 2>/dev/null || true
done
pkill -f "wrangler dev.*--port 8787" 2>/dev/null || true
sleep 1

echo "→ Borrando estado local de Wrangler…"
rm -rf .wrangler/state

echo "→ Arrancando dev:api en http://127.0.0.1:8787…"
exec npm run dev:api
