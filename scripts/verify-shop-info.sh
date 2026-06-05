#!/usr/bin/env bash
set -euo pipefail
: "${MCP_MIDDLEWARE_BASE_URL:?Set MCP_MIDDLEWARE_BASE_URL}"
: "${MCP_SHARED_SECRET:?Set MCP_SHARED_SECRET}"

curl --fail --show-error --silent \
  --request POST "${MCP_MIDDLEWARE_BASE_URL%/}/api/shop/info" \
  --header "Authorization: Bearer ${MCP_SHARED_SECRET}" \
  --header 'Content-Type: application/json' \
  --data '{}'
printf '\n'
