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

# Non-fatal: /billzzz-api is stage 1 of the API rename, still unverified against the
# zone WAF. Never exit non-zero here — a deploy shouldn't fail over a prefix nothing
# depends on yet. Once several deploys confirm a clean 200, promote this to check_status
# and retire the /bills-api one (stage 2).
check_status_informational() {
  local path="$1"
  local code
  code="$(curl -sS -A "Mozilla/5.0 (compatible; post-deploy-smoke)" -o /dev/null -w "%{http_code}" "${BASE_URL}${path}" || echo "curl-failed")"
  echo "[stage-1 WAF probe, informational only] ${path} -> ${code}"
}

echo "== Post-deploy smoke checks (${BASE_URL}) =="
check_status "/" "200"
check_status "/bills-api/health" "200"
check_status "/manifest.webmanifest" "200"
check_status_informational "/billzzz-api/health"

echo "Done."
