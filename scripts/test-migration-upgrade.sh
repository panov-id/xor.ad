#!/usr/bin/env bash
# The upgrade path a live node takes: migrations up to 021 applied, rows in the
# tables that existed then, and everything after 021 applied on top of them.
#
# Why a check of its own: run-relay-database-tests.sh migrates an empty
# database from 001 every time, so a backfill runs over nothing and a
# migration that trips on an existing row never trips. Dev and prod stand at
# 021; the next deploy applies everything above it in one go, over live rows,
# with the same tool (relay/node/tools/migrate_db.ts) this script runs.
#
# What it asserts, each with its own message:
#   - the upgrade exits 0 and records every file on disk in schema_migrations;
#   - every row seeded at 021 is still there;
#   - the backfills that touch tables living at 021 filled what they own:
#     042 (jobs.reported_at on tombstones), 043 (dsa_notices.arrival_sent_at),
#     046 (JSON strings in dsa_notices.snapshot, idempotency.response,
#     jobs.payload unwrapped into values);
#   - a second run of the tool applies nothing;
#   - no jsonb column holds a JSON string (tools/check_jsonb_strings.ts).
# The other backfills above 021 — 027 (feed_messages), 028 (identity_stats),
# 047 (identities), 049 (legal_acceptances) — work on tables born after 021, so
# on this path they run over empty tables; the script says so rather than
# pretending to have checked them.
#
#   scripts/test-migration-upgrade.sh
#   MIGRATIONS_DIR=<copy of relay/node/db> scripts/test-migration-upgrade.sh
#     # the same run over a copy, to watch a broken backfill go red
#   UPGRADE_FROM=021 is the default base; a different one needs other seed rows.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations="$(cd "${MIGRATIONS_DIR:-$root/relay/node/db}" && pwd)"
base="${UPGRADE_FROM:-021}"
image="denoland/deno:alpine-2.1.4"
postgres_image="postgres:16-alpine"

# $$ keeps this run out of the way of the database suite and of a neighbour's.
network="relay-upgrade-net-$$"
container="relay-upgrade-db-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
stage="$(mktemp -d)"

cleanup() {
  docker rm -fv "$container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$stage"
}
trap cleanup EXIT INT TERM

echo "== throwaway postgres"
docker network create "$network" >/dev/null
docker run -d --name "$container" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  "$postgres_image" >/dev/null
# Over TCP, for the reason run-relay-database-tests.sh gives at length: the
# socket answers during initialisation, before the real server is up.
ready() { docker exec "$container" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do
  if ready; then break; fi
  sleep 0.5
done
ready || { echo "postgres did not become ready" >&2; docker logs "$container" 2>&1 | tail -20 >&2; exit 1; }

sql() { docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U relay -d relay_test "$@"; }
# The tool reads db/ next to itself; the directory handed over is mounted there.
migrate() {
  docker run --rm --network "$network" -e DATABASE_URL="$database_url" \
    -v "$root/relay/node":/node -v "$1":/node/db:ro -w /node "$image" \
    deno run --allow-env --allow-net --allow-read tools/migrate_db.ts
}

on_disk=$(find "$migrations" -maxdepth 1 -name '*.sql' | wc -l)
for f in "$migrations"/*.sql; do
  n=$(basename "$f"); [ "${n%%_*}" \> "$base" ] || cp "$f" "$stage/"
done
at_base=$(find "$stage" -maxdepth 1 -name '*.sql' | wc -l)
[ "$at_base" -gt 0 ] || { echo "no migrations at or below $base in $migrations" >&2; exit 1; }

echo "== migrations up to $base ($at_base files): the schema a live node has"
migrate "$stage" | tail -1

echo "== rows in the tables that live at $base"
# Shaped like what the node wrote then, including what later migrations fix:
# jsonb written as a JSON string (046), a job given up for good (042), notices
# from before arrival letters existed (043).
sql <<'SEED'
INSERT INTO brands (key, name, domain, sender, upper)
  VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA');
INSERT INTO api_keys (id, brand, origins) VALUES ('ak_pub_upgradetest00000001', 'alpha', '{https://alpha.test}');
INSERT INTO quota_counters (key_id, counter, day, used) VALUES ('ak_pub_upgradetest00000001', 'events', '2026-09-01', 7);
INSERT INTO pageview_daily (brand, day, path, lang, views, first_views) VALUES ('alpha', '2026-09-01', '/', 'ru', 10, 3);
INSERT INTO idempotency (key, brand, response) VALUES
  ('idem-string', 'alpha', to_jsonb('{"status":200,"body":"ok"}'::text)),
  ('idem-value',  'alpha', '{"status":201}'::jsonb);
-- One live job per kind: jobs_standing (db/020) is unique on kind among the
-- jobs not given up, so a live queue at 021 looks like this.
INSERT INTO jobs (kind, payload, locked_until, attempts, created_at) VALUES
  ('mail', '{"to":"x@alpha.test"}', 'infinity', 8, '2026-08-01'),
  ('mail', '{"to":"y@alpha.test"}', NULL, 0, '2026-09-01'),
  ('prune', to_jsonb('{"to":"z@alpha.test"}'::text), NULL, 0, '2026-09-02');
INSERT INTO dsa_notices (id, brand, target_kind, target_id, snapshot, reason_text, bona_fide, created_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'alpha', 'feed_message', 'm1',
   to_jsonb('{"text":"old words"}'::text), 'unlawful', true, '2026-08-10 10:00+00'),
  ('00000000-0000-4000-8000-000000000002', 'alpha', 'other', NULL,
   '{"text":"a value"}'::jsonb, 'other reason', true, '2026-08-11 11:00+00');
INSERT INTO dsa_statements (brand, notice_id, target_id, recipient_identity, restriction, facts, ground_kind, ground_text)
  VALUES ('alpha', '00000000-0000-4000-8000-000000000001', 'm1', 'someone', 'removed', 'facts', 'legal', 'ground');
SEED
echo "   seeded"

echo "== migrations above $base, over those rows"
rc=0
migrate "$migrations" > "$stage/upgrade.log" 2>&1 || rc=$?
grep -E '^\s+(applied|refuse)|migration\(s\) on disk|error' "$stage/upgrade.log" | tail -4 || true
if [ "$rc" -ne 0 ]; then
  echo "FAIL  the upgrade over live rows exited $rc; its log ends:" >&2
  tail -15 "$stage/upgrade.log" >&2
  exit 1
fi

fails=0
check() {  # <what> <expected> <sql returning one value>
  local got
  got=$(sql -c "$3")
  if [ "$got" = "$2" ]; then echo "ok    $1"; else echo "FAIL  $1: expected $2, got $got"; fails=$((fails + 1)); fi
}

echo "== what the upgrade must have left"
check "every file on disk is recorded ($on_disk)" "$on_disk" "SELECT count(*) FROM schema_migrations"
check "the rows seeded at $base are all still there" "1 1 1 1 2 3 2 1" \
  "SELECT concat_ws(' ', (SELECT count(*) FROM brands), (SELECT count(*) FROM api_keys),
     (SELECT count(*) FROM quota_counters), (SELECT count(*) FROM pageview_daily),
     (SELECT count(*) FROM idempotency), (SELECT count(*) FROM jobs),
     (SELECT count(*) FROM dsa_notices), (SELECT count(*) FROM dsa_statements))"
check "042: the given-up job is marked reported, the live ones are not" "1 0" \
  "SELECT concat_ws(' ', count(*) FILTER (WHERE locked_until = 'infinity' AND reported_at IS NOT NULL),
     count(*) FILTER (WHERE locked_until IS DISTINCT FROM 'infinity' AND reported_at IS NOT NULL)) FROM jobs"
check "043: every old notice counts its arrival letter as sent at its own arrival" "2" \
  "SELECT count(*) FROM dsa_notices WHERE arrival_sent_at = created_at AND arrival_attempts = 0"
check "046: no JSON string left in dsa_notices.snapshot, idempotency.response, jobs.payload" "0 0 0" \
  "SELECT concat_ws(' ', (SELECT count(*) FROM dsa_notices WHERE jsonb_typeof(snapshot) = 'string'),
     (SELECT count(*) FROM idempotency WHERE jsonb_typeof(response) = 'string'),
     (SELECT count(*) FROM jobs WHERE jsonb_typeof(payload) = 'string'))"
check "046: the unwrapped values read as the values that were wrapped" "old words|200|z@alpha.test" \
  "SELECT concat_ws('|', (SELECT snapshot->>'text' FROM dsa_notices WHERE target_id = 'm1'),
     (SELECT response->>'status' FROM idempotency WHERE key = 'idem-string'),
     (SELECT payload->>'to' FROM jobs WHERE created_at = '2026-09-02'))"
check "the new columns on old rows start empty (026 until, 041, 052, 057)" "0" \
  "SELECT (SELECT count(*) FROM dsa_statements WHERE until IS NOT NULL)
        + (SELECT count(*) FROM dsa_notices WHERE reminded_at IS NOT NULL OR escalated_at IS NOT NULL
             OR receipt_hash IS NOT NULL OR aging_tried_at IS NOT NULL)"

echo "== a second run applies nothing"
again=$(migrate "$migrations" 2>&1) || { echo "FAIL  the second run exited non-zero:"; echo "$again" | tail -5; fails=$((fails + 1)); }
if echo "$again" | grep -qE "^$on_disk migration\(s\) on disk, $on_disk already applied, 0 run now$"; then
  echo "ok    second run: $(echo "$again" | tail -1)"
else
  echo "FAIL  second run did not skip everything: $(echo "$again" | tail -1)"; fails=$((fails + 1))
fi

echo "== jsonb columns hold values, not JSON strings of them"
docker run --rm --network "$network" -e DATABASE_URL="$database_url" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/check_jsonb_strings.ts || fails=$((fails + 1))

echo "   not on this path: 027 feed_messages, 028 identity_stats, 047 identities, 049 legal_acceptances — born after $base, empty here"
echo
if [ "$fails" -ne 0 ]; then echo "upgrade $base → $(ls "$migrations" | grep '\.sql$' | tail -1 | cut -d_ -f1): $fails check(s) failed"; exit 1; fi
echo "upgrade $base → $(ls "$migrations" | grep '\.sql$' | tail -1 | cut -d_ -f1): all checks passed"
