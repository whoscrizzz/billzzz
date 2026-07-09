#!/usr/bin/env bash
# Reinicio limpio del worker local — evita SQLITE_BUSY por procesos duplicados.
# Puerto configurable via VITE_API_PORT (default 8787) para correr varios
# worktrees/proyectos en paralelo sin choques.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${VITE_API_PORT:-}"
if [ -z "$PORT" ] && [ -f .env.local ]; then
  PORT="$(grep -m1 '^VITE_API_PORT=' .env.local | cut -d= -f2- | tr -d '[:space:]')"
fi
PORT="${PORT:-8787}"

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
