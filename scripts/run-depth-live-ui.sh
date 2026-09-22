#!/usr/bin/env bash
# The terminal's screens against a live node: a stand of its own, the same way
# scripts/run-depth-tests.sh builds one for the core. Nothing touches the host
# and nothing touches the shared local stand.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deno="denoland/deno:alpine-2.1.4"
node_image="node:24-alpine"
pg_image="postgres:16.13-alpine"
label="depth-live-ui=1"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
network="depth-ui-net-$$"; db="depth-ui-db-$$"; node="depth-ui-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_depthuitest00001"

cleanup() { docker rm -fv "$node" "$db" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker ps -aq --filter "label=$label" | xargs -r docker rm -fv >/dev/null 2>&1 || true
docker network ls -q --filter "label=$label" | xargs -r docker network rm >/dev/null 2>&1 || true

docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$pg_image" >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; exit 1; }

# shellcheck disable=SC2086
docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache \
  -v "$root/relay/node":/node -w /node "$deno" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null
docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=depth-ui-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=depth-ui -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=depth-ui-origin \
  -v "$root/relay/node":/node -w /node "$deno" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null
up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

[ -d "$root/depth/node_modules" ] || docker run --rm -v "$root/depth":/d -w /d "$node_image" npm install --no-audit --no-fund >/dev/null
status=0
docker run --rm --network "$network" \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_DATABASE_URL="$database_url" \
  -e DEPTH_ORIGIN_TOKEN=depth-ui-origin \
  -v "$root":/repo -w /repo/depth "$node_image" \
  node --experimental-transform-types ink/live.node-test.ts || status=$?
if [ "$status" -ne 0 ]; then echo "── node log (tail) ──" >&2; docker logs "$node" 2>&1 | tail -30 >&2; fi
exit "$status"
