#!/usr/bin/env bash
# The measurement of §8.14 the registry asked for (open.tsv moderation.model,
# moderation.queue.throughput): what the rules of §8.3 do with a corpus of
# phrases on a live node — the share published at once and the share queued
# for a person, by class; the false passes (a masked link or contact the
# rules let through) and the false catches (a clean phrase queued); and the
# time of the verdict at POST /feed, p50/p95. Everything in Docker, nothing on
# the host: a throwaway Postgres, the node from these sources with
# FEED_VERDICT=rules, and the driver scripts/measure-feed-rules.ts through
# depth/core Client — the same signed calls a face makes.
#
#   scripts/measure-feed-rules.sh                 # prints the JSON report
#   scripts/measure-feed-rules.sh > report.json
#
# The report goes into docs/measurements/feed-rules-<date>_{RU,EN}.md by hand,
# with the date and the sha it was taken at; the numbers are never typed.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
pg_image="postgres:16-alpine"
label="measure-rules=$$"
network="measure-rules-net-$$"
db="measure-rules-db-$$"
node="measure-rules-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_measurerules00001"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"

cleanup() {
  docker rm -fv "$node" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$pg_image" >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; exit 1; }

# shellcheck disable=SC2086
docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null
docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# The rules on, as the default node runs (FEED_VERDICT=rules); the origin token
# lets each registration look like its own address, as the test stands do.
# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=measure-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=measure -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=measure-origin \
  -e FEED_VERDICT=rules \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null
up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

echo "== node $(git -C "$root" rev-parse --short HEAD), FEED_VERDICT=rules; corpus by class → JSON" >&2
# shellcheck disable=SC2086
docker run --rm --network "$network" $cache \
  -e MEASURE_NODE_URL=http://node:8080 -e MEASURE_API_KEY="$key_id" -e DEPTH_ORIGIN_TOKEN=measure-origin \
  -v "$root":/repo -w /repo "$image" \
  deno run --config depth/deno.json --allow-env --allow-net --allow-read scripts/measure-feed-rules.ts
