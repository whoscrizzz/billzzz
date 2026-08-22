#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://billzzz.whoscrizzz.com}"

check_status() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl -sS -L -A "Mozilla/5.0 (compatible; post-deploy-smoke)" -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")"
  if [ "$code" != "$expected" ]; then
    echo "Smoke check failed: ${path} expected ${expected}, got ${code}"
    exit 1
  fi
  echo "OK ${path} -> ${code}"
}

# Stage 2 cutover: /bills-api was retired on purpose. wrangler.jsonc has
# not_found_handling: single-page-application, so an unrecognized path returns 200
# with the SPA shell (not a 404) — the real signal that the old prefix is gone is
# content-type, not status code.
check_retired_prefix() {
  local path="$1"
  local content_type
  content_type="$(curl -sS -A "Mozilla/5.0 (compatible; post-deploy-smoke)" -o /dev/null -w "%{content_type}" "${BASE_URL}${path}")"
  if [[ "$content_type" == application/json* ]]; then
    echo "Smoke check failed: ${path} still served as API (content-type: ${content_type})"
    exit 1
  fi
  echo "OK ${path} -> not API anymore (content-type: ${content_type})"
}

echo "== Post-deploy smoke checks (${BASE_URL}) =="
check_status "/" "200"
check_status "/billzzz-api/health" "200"
check_status "/manifest.webmanifest" "200"
check_retired_prefix "/bills-api/health"

echo "Done."
