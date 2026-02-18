#!/usr/bin/env sh
set -eu

base_url="${NODE_AGENT_BASE_URL:-http://node-agent-1:8082}"

post_host() {
  payload="$1"
  status_code="$(curl -sS -o /tmp/woly-seed-response -w '%{http_code}' \
    -X POST "${base_url}/hosts" \
    -H 'Content-Type: application/json' \
    -d "${payload}")"

  if [ "${status_code}" = "201" ] || [ "${status_code}" = "409" ]; then
    return 0
  fi

  echo "Seed request failed with HTTP ${status_code} against ${base_url}/hosts" >&2
  cat /tmp/woly-seed-response >&2 || true
  exit 1
}

post_host '{
  "name": "DEV-DESKTOP-1",
  "mac": "AA:BB:CC:DD:EE:11",
  "ip": "192.168.10.11",
  "notes": "Seeded development desktop",
  "tags": ["seed", "desktop"]
}'

post_host '{
  "name": "DEV-NAS-1",
  "mac": "AA:BB:CC:DD:EE:12",
  "ip": "192.168.10.12",
  "notes": "Seeded development NAS",
  "tags": ["seed", "nas"]
}'

echo "Seed hosts ensured via ${base_url}/hosts"
