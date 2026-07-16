#!/usr/bin/env bash
# Integration test: bring up the local stand (node + Mailpit + fs storage),
# drive /waitlist, and assert the object was stored, the welcome email was
# caught by Mailpit, and a repeat signup dedups. Self-contained; needs Docker.
set -euo pipefail
LOCAL="$(cd "$(dirname "$0")/../local" && pwd)"
cd "$LOCAL"
NODE=http://localhost:8081
MAILPIT=http://localhost:8025

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

mkdir -p data
docker compose up -d --build >/tmp/edge-int.log 2>&1 || { echo "up failed"; tail -20 /tmp/edge-int.log; exit 1; }

echo "· wait for node"
for _ in $(seq 1 30); do curl -fsS "$NODE/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "$NODE/health" >/dev/null || { echo "FAIL: node not healthy"; exit 1; }

echo "· POST /waitlist"
curl -sS -X POST "$NODE/waitlist" -H 'content-type: application/json' \
  -d '{"email":"it@example.com","source":"sosed.place-landing","lang":"ru","mode":"dark"}' \
  | grep -q '"ok":true' || { echo "FAIL: waitlist"; exit 1; }
sleep 2

echo "· assert stored object"
ls data/waitlist/local/*.json >/dev/null 2>&1 || { echo "FAIL: no storage object"; exit 1; }

echo "· assert Mailpit caught the welcome"
total=$(curl -sS "$MAILPIT/api/v1/messages" | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))")
[ "${total:-0}" -ge 1 ] || { echo "FAIL: Mailpit empty"; exit 1; }

echo "· assert dedup on repeat"
curl -sS -X POST "$NODE/waitlist" -H 'content-type: application/json' \
  -d '{"email":"it@example.com","source":"x","lang":"ru"}' \
  | grep -q '"duplicate":true' || { echo "FAIL: dedup"; exit 1; }

echo "INTEGRATION OK — health · waitlist→storage+mail · dedup"
