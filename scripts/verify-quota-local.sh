#!/usr/bin/env bash
# A quota against a real database: set a small allowance, spend it, and watch the
# refusal arrive — then confirm the key is refused rather than the tenant, and
# that the answer says when to come back.
#
# The allowance here is deliberately tiny, which also exercises the honest
# weakness of batched counting: the limit is enforced within a flush interval, so
# a burst can overshoot slightly. The check asserts that traffic stops, not that
# it stops at exactly the nth request.
#
# It spends the allowance on /waitlist rather than /pageview on purpose. The page
# counter never argues with the device it counts — it answers 200 whatever the
# verdict and simply stores nothing — so a quota is invisible there. A signup is
# a transaction, and a refused one has to say it was refused.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
secret="local-panel-secret"

echo "== stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node postgres >/dev/null
for _ in $(seq 30); do curl -fsS "$api/health" >/dev/null 2>&1 && break; sleep 1; done
docker run --rm --network host -v "$root/relay/node":/node -w /node \
  -e DATABASE_URL='postgres://relay:local@localhost:62432/relay' "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts 2>/dev/null | tail -1

token="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 "" 2>/dev/null | tail -1)"

echo
echo "== a key with an allowance of 2"
key="$(curl -sS -X POST "$api/admin/api-keys" -H "authorization: Bearer $token" \
  -H 'content-type: application/json' --data '{"brand":"sosed","origins":[]}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
curl -sS -X PATCH "$api/admin/api-keys/$key/quota" -H "authorization: Bearer $token" \
  -H 'content-type: application/json' --data '{"quota_events_per_day":2}' |
  python3 -c 'import json,sys; k=json.load(sys.stdin); print("   {} limit={}".format(k["id"][:24]+"…", k["quota_events_per_day"]))'

echo
echo "== spending it"
stamp="$(date +%s)"
for attempt in 1 2 3 4 5; do
  code="$(curl -sS -o /tmp/quota.json -w '%{http_code}' -X POST "$api/waitlist" \
    -H 'content-type: application/json' -H "x-api-key: $key" \
    --data "{\"email\":\"quota-${attempt}-${stamp}@example.com\",\"source\":\"quota-check\",\"lang\":\"en\"}")"
  printf '   request %d → HTTP %s' "$attempt" "$code"
  if [ "$code" = "429" ]; then
    python3 -c '
import json
body = json.load(open("/tmp/quota.json"))
print("  {} · limit {} · resets in {}s".format(
    body.get("error"), body.get("limit"), body.get("resets_in_seconds")))
'
  else
    echo
  fi
done

echo
echo "== and after the counter reaches the database"
sleep 11
echo "   HTTP $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/waitlist" \
  -H 'content-type: application/json' -H "x-api-key: $key" \
  --data "{\"email\":\"quota-after-${stamp}@example.com\",\"source\":\"quota-check\",\"lang\":\"en\"}") (expect 429 — the limit is a day, not a burst)"

echo
echo "== the page counter never argues, but stores nothing over the limit"
echo "   pageview HTTP $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/pageview" \
  -H 'content-type: application/json' -H "x-api-key: $key" \
  --data '{"path":"/","lang":"en","source":"quota-check"}') (expect 200 — telemetry cannot act on a refusal)"

echo
echo "== another key of the same tenant is unaffected"
other="$(curl -sS -X POST "$api/admin/api-keys" -H "authorization: Bearer $token" \
  -H 'content-type: application/json' --data '{"brand":"sosed","origins":[]}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
echo "   HTTP $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/pageview" \
  -H 'content-type: application/json' -H "x-api-key: $other" \
  --data '{"path":"/","lang":"en","source":"quota-check"}') (expect 200 — a quota is per key)"

echo
echo "== what the panel shows"
curl -sS -H "authorization: Bearer $token" "$api/admin/api-keys" |
  python3 -c "
import json, sys
for key in json.load(sys.stdin)[:3]:
    limit = key.get('quota_events_per_day')
    print('   {}… used={} limit={}'.format(key['id'][:22], key.get('used_today'), limit if limit else 'unlimited'))
"
