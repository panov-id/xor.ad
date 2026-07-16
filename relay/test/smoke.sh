#!/usr/bin/env bash
# Post-deploy smoke against a deployed env. Run from a whitelisted host (private
# dev/staging only allow whitelisted IPs) or against public prod.
#   BASE=https://n1-dev.pool.panov.id ./smoke.sh
set -euo pipefail
BASE="${BASE:?set BASE, e.g. https://n1-dev.pool.panov.id}"
EMAIL="${1:-smoke+$(date +%s)@example.com}"

echo "· GET $BASE/health"
curl -fsS -m 10 "$BASE/health" | grep -q '"status":"ok"' || { echo "FAIL: health"; exit 1; }

echo "· POST $BASE/waitlist ($EMAIL)"
curl -fsS -m 10 -X POST "$BASE/waitlist" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"source\":\"smoke\",\"lang\":\"en\"}" | grep -q '"ok"' \
  || { echo "FAIL: waitlist"; exit 1; }

echo "SMOKE OK — $BASE (welcome for a dev/staging env lands in that box's Mailpit)"
