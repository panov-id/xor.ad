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

rm -rf data && mkdir -p data && chmod 777 data   # fresh + writable by the container's non-root user (uid may differ from the host, e.g. CI)
docker compose up -d --build >/tmp/relay-int.log 2>&1 || { echo "up failed"; tail -20 /tmp/relay-int.log; exit 1; }

echo "· wait for node"
for _ in $(seq 1 30); do curl -fsS "$NODE/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "$NODE/health" >/dev/null || { echo "FAIL: node not healthy"; exit 1; }

echo "· POST /waitlist"
curl -sS -X POST "$NODE/waitlist" -H 'content-type: application/json' \
  -d '{"email":"it@example.com","source":"sosed.place-landing","lang":"ru","mode":"dark"}' \
  | grep -q '"ok":true' || { echo "FAIL: waitlist"; exit 1; }

echo "· assert stored object"  # put() is awaited before the 200, so the file is there
ls data/waitlist/local/*.json >/dev/null 2>&1 || { echo "FAIL: no storage object"; exit 1; }

echo "· assert Mailpit caught the welcome"  # SMTP is async — poll
total=0
for _ in $(seq 1 10); do
  total=$(curl -sS "$MAILPIT/api/v1/messages" | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo 0)
  [ "${total:-0}" -ge 1 ] && break
  sleep 1
done
[ "${total:-0}" -ge 1 ] || { echo "FAIL: Mailpit empty"; exit 1; }

echo "· assert dedup on repeat"
curl -sS -X POST "$NODE/waitlist" -H 'content-type: application/json' \
  -d '{"email":"it@example.com","source":"x","lang":"ru"}' \
  | grep -q '"duplicate":true' || { echo "FAIL: dedup"; exit 1; }

echo "INTEGRATION OK — health · waitlist→storage+mail · dedup"
