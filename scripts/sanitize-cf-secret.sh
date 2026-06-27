#!/usr/bin/env bash
# Normaliza secrets de Cloudflare (espacios, comillas, CRLF) antes de exportarlos.
set -euo pipefail

sanitize() {
  local value="$1"
  value="$(printf '%s' "$value" | tr -d '\r\n')"
  value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  value="$(printf '%s' "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  printf '%s' "$value"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  sanitize "${1:-}"
fi
