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
  docker rm -fv "$container" >/dev/null 2>&1 || true
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
#
# Over TCP, and not the unix socket. The image runs a temporary server to create
# the database, and that one listens on the socket alone — the log says
# "listening on Unix socket" and nothing more, while the real server also says
# "listening on IPv4 address". A socket probe therefore answers "accepting
# connections" during initialisation, and the check right after it can land in
# the tenth of a second between that server stopping and the real one starting.
# Which is exactly what it did: three runs in a row failed, the same script
# under `bash -x` passed.
ready() { docker exec "$container" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do
  if ready; then break; fi
  sleep 0.5
done
ready || {
  echo "postgres did not become ready" >&2
  docker logs "$container" 2>&1 | tail -20 >&2
  exit 1
}

echo "== migrations (the same tool the wizard runs before a node starts)"
docker run --rm --network "$network" \
  -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts

# The suites are the ones `deno task test` ignores (relay/node/deno.json), read
# from there as CI reads them, so a suite moved out of the unit run is run here
# too without a second edit (loop, 2026-09-24). Until then this file listed the
# ten by hand, each with a paragraph; what the paragraphs said still holds:
#   - every file runs in its own process: several set environment before the
#     first import, and config captures it once;
#   - database.test.ts gets --allow-run: its lock-timeout tests spawn the
#     pruning command and the migration tool as child processes;
#   - identity_sweeper.test.ts sees the repository root, read-only: one case
#     reads docs/facts/limits.tsv, because the deadlines belong to the registry.
suites=$(grep -o -- '--ignore=[^ "]*' "$root/relay/node/deno.json" | cut -d= -f2 | tr ',' '\n' || true)
[ -n "$suites" ] || { echo "no suites found in the --ignore list of relay/node/deno.json" >&2; exit 1; }
for suite in $suites; do
  echo
  echo "== $suite"
  mount=(-v "$root/relay/node":/node -w /node)
  extra=()
  case "$suite" in
    test/database.test.ts) extra=(--allow-run) ;;
    test/identity_sweeper.test.ts) mount=(-v "$root":/repo:ro -w /repo/relay/node) ;;
  esac
  docker run --rm --network "$network" \
    -e DATABASE_URL="$database_url" \
    "${mount[@]}" "$image" \
    deno test --allow-env --allow-net --allow-read --allow-write "${extra[@]}" "$suite" "$@"
done

echo
echo "== jsonb columns hold values, not JSON strings of them"
# Last, after every suite has written: it asks the data rather than the code,
# so a writer that hands a string to a jsonb column is caught whatever its SQL
# looks like (tools/check_jsonb_strings.ts; loop, 2026-09-24).
docker run --rm --network "$network" \
  -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/check_jsonb_strings.ts
# A filtered run wrote only what its chosen tests wrote: the check above saw part
# of the writers, and a green line is not the whole answer.
[ "$#" -eq 0 ] || echo "   (partial run: filtered by $*; the jsonb check saw only what those tests wrote)"
