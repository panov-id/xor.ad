#!/usr/bin/env bash
# Run the relay's database suite against a throwaway Postgres, in Docker, with
# nothing installed on the host.
#
# Why a suite of its own: every other test runs with DATABASE_URL unset, so the
# branches that need a database do not fail there — they do not execute. That is
# how a foreign key that made key issuance impossible reached a live box while CI
# stayed green.
#
# The database is created, migrated, used and destroyed inside one run. It is not
# the local stand's Postgres (relay/local/docker-compose.yml): a suite that
# deletes rows must never be pointed at a stand someone is looking at, and no
# host port is published here so the two cannot be confused.
#
#   scripts/run-relay-database-tests.sh                 # the whole suite
#   scripts/run-relay-database-tests.sh --filter quota  # args go to `deno test`
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
postgres_image="postgres:16-alpine"

# $$ keeps two runs (or a run and CI on the same machine) out of each other's way.
network="relay-test-net-$$"
container="relay-test-db-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
# Torn down on success, on failure and on Ctrl-C alike: a leftover container would
# be found by the next run's name check, not by the person who left it.
trap cleanup EXIT INT TERM

echo "== throwaway postgres"
docker network create "$network" >/dev/null
docker run -d --name "$container" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  "$postgres_image" >/dev/null

# Ready means "answering", not "started": the container is up long before the
# first connection is accepted, and migrating too early fails on a race.
for _ in $(seq 40); do
  if docker exec "$container" pg_isready -U relay -d relay_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$container" pg_isready -U relay -d relay_test >/dev/null || {
  echo "postgres did not become ready" >&2
  exit 1
}

echo "== migrations (the same tool the wizard runs before a node starts)"
docker run --rm --network "$network" \
  -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts

echo
echo "== database suite"
docker run --rm --network "$network" \
  -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno test --allow-env --allow-net --allow-read --allow-write test/database.test.ts "$@"
