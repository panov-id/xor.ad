#!/usr/bin/env bash
# E2b: the node's hint path with the real model, end to end
# (relay/node/test/moderator_live.test.ts). A throwaway Postgres migrated to
# the top, the model on an internal network with no way out, and the test in a
# container that joins both: the database's network and the model's.
#
#   relay/moderator/run-live.sh      # exit code is the test's
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="denoland/deno:alpine-2.1.4"
dbnet="moderator-live-db-$$"
modelnet="moderator-live-model-$$"
db="moderator-live-pg-$$"
model="moderator-live-model-$$"
runner="moderator-live-test-$$"
url="postgres://relay:test@postgres:5432/relay_test"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
cleanup() {
  docker rm -fv "$runner" "$model" "$db" >/dev/null 2>&1 || true
  docker network rm "$dbnet" "$modelnet" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker volume inspect moderator-models >/dev/null 2>&1 || { echo "no volume moderator-models: see relay/moderator/README_EN.md" >&2; exit 1; }
docker network create "$dbnet" >/dev/null
docker network create --internal "$modelnet" >/dev/null
docker run -d --name "$db" --network "$dbnet" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test postgres:16-alpine >/dev/null
docker run -d --name "$model" --network "$modelnet" --network-alias model \
  -v moderator-models:/root/.ollama ollama/ollama:0.3.14 >/dev/null
for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
if docker exec "$model" sh -c 'getent hosts registry.ollama.ai' >/dev/null 2>&1; then
  echo "the model's network reaches outside" >&2; exit 1
fi
# shellcheck disable=SC2086
docker run --rm --network "$dbnet" -e DATABASE_URL="$url" $cache -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null

# shellcheck disable=SC2086
docker create --name "$runner" --network "$dbnet" $cache \
  -e DATABASE_URL="$url" -e MODERATOR_URL=http://model:11434 \
  -v "$root/relay/node":/node:ro -w /node "$image" \
  deno test --cached-only --allow-env --allow-net --allow-read --allow-write test/moderator_live.test.ts >/dev/null
docker network connect "$modelnet" "$runner"
docker start -a "$runner"
