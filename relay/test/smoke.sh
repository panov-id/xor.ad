#!/usr/bin/env bash
# Post-deploy smoke against a deployed env. Run from a whitelisted host (private
# dev/staging only allow whitelisted IPs) or against public prod.
#
#   BASE=https://n1-dev.pool.panov.id ./smoke.sh
#   BASE=https://n1-dev.pool.panov.id API_KEY=... ./smoke.sh
#
# The key is optional because the environments differ: prod serves the write path
# to anyone, dev and staging set REQUIRE_API_KEY and answer 401 without one.
# Until 2026-09-02 this script sent no key at all and had no idea such a thing
# existed, so on the two environments it is actually run against, its only write
# check answered 401 and the whole smoke went red after a perfectly good deploy —
# measured that day, right after one.
#
# Exit codes: 0 — everything checked and passed; 1 — a check failed; 3 — the write
# path could not be exercised at all because this environment wants a key and none
# was given. Three rather than nought: a smoke that quietly skips the only thing it
# writes is a green light for a deploy nobody verified.
set -euo pipefail
BASE="${BASE:?set BASE, e.g. https://n1-dev.pool.panov.id}"
API_KEY="${API_KEY:-}"
EMAIL="${1:-smoke+$(date +%s)@example.com}"

echo "· GET $BASE/health"
curl -fsS -m 10 "$BASE/health" | grep -q '"status":"ok"' || { echo "FAIL: health"; exit 1; }

echo "· POST $BASE/waitlist ($EMAIL)${API_KEY:+ with a key}"
# The body and the status separately: -f turns a 401 into an exit code and throws
# the body away, and the body is what says which of the two 401s this is.
key_header=()
[ -n "$API_KEY" ] && key_header=(-H "x-api-key: $API_KEY")
response=$(curl -sS -m 10 -o /tmp/smoke_body.$$ -w '%{http_code}' \
  -X POST "$BASE/waitlist" -H 'content-type: application/json' \
  "${key_header[@]}" \
  -d "{\"email\":\"$EMAIL\",\"source\":\"smoke\",\"lang\":\"en\"}") || true
body=$(cat /tmp/smoke_body.$$ 2>/dev/null || true)
rm -f /tmp/smoke_body.$$

if [ "$response" = 401 ] && [ -z "$API_KEY" ]; then
  echo "NOT CHECKED — $BASE wants an API key for the write path (401: $body)."
  echo "  Health is fine; nothing was written. Re-run with API_KEY=... to check it."
  exit 3
fi

if [ "$response" != 200 ] || ! printf '%s' "$body" | grep -q '"ok"'; then
  echo "FAIL: waitlist (HTTP $response) $body"
  exit 1
fi

echo "SMOKE OK — $BASE (welcome for a dev/staging env lands in that box's Mailpit)"
