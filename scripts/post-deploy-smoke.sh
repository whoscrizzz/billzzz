#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://billzzz.whoscrizzz.com}"

check_status() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl -sS -A "Mozilla/5.0 (compatible; post-deploy-smoke)" -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")"
  if [ "$code" != "$expected" ]; then
    echo "Smoke check failed: ${path} expected ${expected}, got ${code}"
    exit 1
  fi
  echo "OK ${path} -> ${code}"
}

echo "== Post-deploy smoke checks (${BASE_URL}) =="
check_status "/" "200"
check_status "/bills-api/health" "200"
check_status "/manifest.webmanifest" "200"

echo "Done."
