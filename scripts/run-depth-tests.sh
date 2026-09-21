#!/usr/bin/env bash
# Tests of the depth client's core, against a live node of its own.
#
# The core talks HTTP to a node the way the terminal will, so its tests get a
# real one: a throwaway network, a throwaway Postgres, the migrations, and the
# node started from the current sources — not the shared local stand, whose
# state belongs to whoever is using it. A storefront key is written straight
# into the database, because registration asks for one.
#
# The unit tests (sign.test.ts) run in the same pass; they need no node.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
network="depth-test-net-$$"
db="depth-test-db-$$"
node="depth-test-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_depthcoretest0001"

cleanup() {
  docker rm -f "$node" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker network create "$network" >/dev/null
docker run -d --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  postgres:16-alpine >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; exit 1; }

docker run --rm --network "$network" -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null

docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

docker run -d --name "$node" --network "$network" --network-alias node \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=depth-test-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=depth-test -e ALLOWED_ORIGINS="" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null

up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

docker run --rm --network "$network" \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_DATABASE_URL="$database_url" \
  -v "$root":/repo -w /repo "$image" \
  deno test --allow-env --allow-read --allow-net depth/ "$@"
