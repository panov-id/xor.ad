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
# Exact, not "16-alpine": a minor version that moves between runs is a test that
# changes under nobody's hand (depth-core panel, 2026-09-21).
pg_image="postgres:16.13-alpine"
label="depth-test=1"
# One module cache for all three Deno runs and every later one: without it each
# run downloaded the node's and the tests' dependencies afresh.
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
network="depth-test-net-$$"
db="depth-test-db-$$"
node="depth-test-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_depthcoretest0001"

cleanup() {
  docker rm -fv "$node" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Leftovers of a run killed hard (SIGKILL skips the trap): by label, not by name.
docker ps -aq --filter "label=$label" | xargs -r docker rm -fv >/dev/null 2>&1 || true
docker network ls -q --filter "label=$label" | xargs -r docker network rm >/dev/null 2>&1 || true

docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  "$pg_image" >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; exit 1; }

migrations="$(mktemp)"
# shellcheck disable=SC2086
if ! docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >"$migrations" 2>&1; then
  echo "migrations failed:" >&2; tail -30 "$migrations" >&2; rm -f "$migrations"; exit 1
fi
rm -f "$migrations"

docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=depth-test-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=depth-test -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=depth-test-origin \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null

up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

# A green run with the live tests skipped would prove nothing: they ignore
# themselves when the node's address is missing, so the run must report none
# ignored (depth-core panel, 2026-09-21).
out="$(mktemp)"
status=0
# shellcheck disable=SC2086
docker run --rm --network "$network" $cache \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_DATABASE_URL="$database_url" -e DEPTH_ORIGIN_TOKEN=depth-test-origin \
  -v "$root":/repo -w /repo "$image" \
  deno test --allow-env --allow-read --allow-net depth/ "$@" 2>&1 | tee "$out" || status=$?
if [ "$status" -eq 0 ] && grep -qE "[1-9][0-9]* ignored" "$out"; then
  echo "tests were skipped — the live ones must run here" >&2; status=1
fi
rm -f "$out"
# A failure against a live node is read in the node's own log first.
if [ "$status" -ne 0 ]; then echo "── node log (tail) ──" >&2; docker logs "$node" 2>&1 | tail -30 >&2; fi
exit "$status"
