#!/usr/bin/env bash
# Keys and brands against a real Postgres on the stand: migrate what storage
# holds, mint, use, revoke, and check the thing the move was for — a revoked key
# stops working now, not within a cache TTL.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
database="postgres://relay:local@localhost:62432/relay"

run_tool() { # $1… = deno args
  docker run --rm --network host -v "$root/relay/node":/node -w /node \
    -e DATABASE_URL="$database" -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/data \
    -e NODE_ENV_NAME=local -v "$root/relay/local/data":/data \
    "$image" deno run --allow-env --allow-net --allow-read --allow-write "$@"
}

echo "== bringing up the stand (node + postgres)"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node postgres >/dev/null
for _ in $(seq 30); do curl -fsS "$api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

echo
echo "== schema"
run_tool tools/migrate_db.ts 2>/dev/null | tail -2

echo
echo "== what storage holds, moved into the database"
run_tool tools/migrate_control_state.ts --apply 2>/dev/null | grep -E 'brands:|keys:|wrote' | sed 's/^/  /'

echo
echo "== the panel mints one through the API"
secret="local-panel-secret"
token="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 "" 2>/dev/null | tail -1)"
key="$(curl -sS -X POST "$api/admin/api-keys" -H "authorization: Bearer $token" \
  -H 'content-type: application/json' --data '{"brand":"sosed","origins":[]}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
echo "   $key"

echo
echo "== a signup with it"
echo "   HTTP $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/waitlist" \
  -H 'content-type: application/json' -H "x-api-key: $key" \
  --data "{\"email\":\"db-check-$(date +%s)@example.com\",\"source\":\"check\",\"lang\":\"en\"}")"

echo
echo "== revoke, then try again immediately"
curl -sS -o /dev/null -X POST "$api/admin/api-keys/$key/revoke" -H "authorization: Bearer $token"
# No sleep on purpose: with the key in storage this needed up to a minute, which
# is the difference the move is supposed to make.
echo "   HTTP $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/waitlist" \
  -H 'content-type: application/json' -H "x-api-key: $key" \
  --data "{\"email\":\"db-check-revoked@example.com\",\"source\":\"check\",\"lang\":\"en\"}") (expect 401)"

echo
echo "== the row is stamped, not deleted"
docker exec edge-node-local-postgres-1 psql -U relay -d relay -tAc \
  "SELECT id, brand, revoked_at IS NOT NULL FROM api_keys WHERE id = '$key'" | sed 's/^/   /'
