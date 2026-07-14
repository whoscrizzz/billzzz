#!/usr/bin/env bash
# Reinicio limpio del worker local — evita SQLITE_BUSY por procesos duplicados.
# Puerto configurable via VITE_API_PORT (default 8787) para correr varios
# worktrees/proyectos en paralelo sin choques.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Same resolution as scripts/dev-api.mjs (Vite's own loadEnv) — a separate
# hand-rolled parser here previously handled quoting/whitespace differently
# and could silently target the wrong port.
PORT="$(node -e "import('vite').then(({loadEnv}) => console.log(loadEnv('development', process.cwd(), '').VITE_API_PORT || '8787'))")"

echo "→ Deteniendo wrangler/workerd en ${PORT} (si hay)…"
for pid in $(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
  kill "$pid" 2>/dev/null || true
done
pkill -f "wrangler dev.*--port ${PORT}" 2>/dev/null || true
sleep 1

echo "→ Borrando estado local de Wrangler…"
rm -rf .wrangler/state

echo "→ Arrancando dev:api en http://127.0.0.1:${PORT}…"
exec npm run dev:api
