#!/usr/bin/env bash
# The leap prod has to take: a database at 021 with rows in it, migrated to
# the last file on disk — and then the two ways back out of that state.
#
#   1. rollback: the image prod runs today (relay/node at 8f89e7a, schema 021)
#      started on the migrated database must still answer /health with the
#      database up — a deploy that fails after migrating rolls back to it;
#   2. restore drill: pg_dump of the migrated database, restored into a clean
#      Postgres, and the node of this tree on it: /health 200 with the
#      database up, and every table holding the rows it held before the dump.
#
# The upgrade itself, backfill by backfill, is scripts/test-migration-upgrade.sh;
# this one starts where that one ends. Offline: its own network and databases
# named by PID, no host port, images built from this repository.
#
#   scripts/check-migration-leap.sh
#   OLD_REF=<commit> scripts/check-migration-leap.sh   # another image to roll back to
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
old_ref="${OLD_REF:-8f89e7a}"
live_base="021"
deno_image="denoland/deno:alpine-2.1.4"
postgres_image="postgres:16-alpine"
net="leap-net-$$"; src="leap-src-$$"; dst="leap-dst-$$"; old="leap-old-$$"; new="leap-new-$$"
old_tag="leap-old:$$"; new_tag="leap-new:$$"
work="$(mktemp -d)"
fails=0
fail() { echo "  FAIL $*"; fails=$((fails + 1)); }
pass() { echo "  ok   $*"; }

cleanup() {
  docker rm -fv "$src" "$dst" "$old" "$new" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  docker rmi -f "$old_tag" "$new_tag" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

pg_up() {  # <container>
  docker run -d --name "$1" --network "$net" --network-alias "$1" \
    -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$postgres_image" >/dev/null
  for _ in $(seq 60); do docker exec "$1" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && return 0; sleep 0.5; done
  echo "postgres $1 did not become ready" >&2; return 1
}
sql() { docker exec -i "$1" psql -v ON_ERROR_STOP=1 -qAt -U relay -d relay_test; }
migrate() {  # <container> <migrations dir>
  docker run --rm --network "$net" -e DATABASE_URL="postgres://relay:test@$1:5432/relay_test" \
    -v "$root/relay/node":/node:ro -v "$2":/node/db:ro -w /node "$deno_image" run --allow-env --allow-net --allow-read tools/migrate_db.ts
}
# Every table's row count, one "table count" line each, sorted: the fingerprint
# the restore must reproduce.
counts() {
  sql "$1" <<'SQL'
SELECT format('SELECT %L || '' '' || count(*) FROM %I.%I', tablename, schemaname, tablename)
  FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL
}
health() {  # <node container> -> the JSON /health answered, or nothing
  for _ in $(seq 40); do
    body=$(docker run --rm --network "$net" alpine:3.20 wget -q -T 3 -O - "http://$1:8080/health" 2>/dev/null) && { echo "$body"; return 0; }
    sleep 1
  done
  return 1
}
node_run() {  # <container> <image> <db container>
  docker run -d --name "$1" --network "$net" --network-alias "$1" \
    -e NODE_ENV_NAME=local -e DATABASE_URL="postgres://relay:test@$3:5432/relay_test" "$2" >/dev/null
}

echo "== images: rollback target $old_ref and this tree"
git -C "$root" archive "$old_ref" relay/node | tar -x -C "$work"
docker build -q -t "$old_tag" "$work/relay/node" >/dev/null || { echo "build of $old_ref failed" >&2; exit 1; }
docker build -q -t "$new_tag" "$root/relay/node" >/dev/null || { echo "build of this tree failed" >&2; exit 1; }
docker network create "$net" >/dev/null

echo "== $live_base with rows, then every file above it"
pg_up "$src" || exit 1
mkdir -p "$work/db-$live_base"
for f in "$root"/relay/node/db/*.sql; do
  n=$(basename "$f" | cut -c1-3); [ "$n" \> "$live_base" ] || cp "$f" "$work/db-$live_base/"
done
migrate "$src" "$work/db-$live_base" | tail -1
sql "$src" <<'SQL' || fail "the seed rows do not fit the schema at 021"
INSERT INTO brands (key, name, domain, sender, upper) VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA');
INSERT INTO api_keys (id, brand, origins) VALUES ('ak_pub_leaptest0000000001', 'alpha', '{https://alpha.test}');
INSERT INTO quota_counters (key_id, counter, day, used) VALUES ('ak_pub_leaptest0000000001', 'events', '2026-09-01', 7);
INSERT INTO pageview_daily (brand, day, path, lang, views, first_views) VALUES ('alpha', '2026-09-01', '/', 'ru', 10, 3);
INSERT INTO idempotency (key, brand, response) VALUES ('idem-value', 'alpha', '{"status":201}'::jsonb);
INSERT INTO jobs (kind, payload, locked_until, attempts, created_at) VALUES ('mail', '{"to":"y@alpha.test"}', NULL, 0, '2026-09-01');
INSERT INTO dsa_notices (id, brand, target_kind, target_id, snapshot, reason_text, bona_fide, status, created_at)
  VALUES ('00000000-0000-4000-8000-0000000000aa', 'alpha', 'other', NULL, '{"text":"x"}'::jsonb, 'reason', true, 'received', '2026-08-10 10:00+00');
SQL
migrate "$src" "$root/relay/node/db" | tail -1
on_disk=$(ls "$root"/relay/node/db/*.sql | wc -l)
applied=$(echo "SELECT count(*) FROM schema_migrations" | sql "$src")
[ "$applied" = "$on_disk" ] && pass "migrated: $applied of $on_disk files recorded" || fail "schema_migrations holds $applied, $on_disk files on disk"
for t in brands api_keys quota_counters pageview_daily dsa_notices; do
  n=$(echo "SELECT count(*) FROM $t" | sql "$src")
  [ "$n" -ge 1 ] && pass "$t kept its row through the leap ($n)" || fail "$t lost the row seeded at $live_base"
done

echo "== 1. rollback: the $old_ref image on the migrated database"
node_run "$old" "$old_tag" "$src"
if body=$(health "$old"); then
  echo "$body" | grep -q '"database":"ok"' && pass "$old_ref /health: database ok" || fail "$old_ref /health without the database: $body"
else
  fail "$old_ref did not answer /health on the migrated database: $(docker logs "$old" 2>&1 | tail -3 | tr '\n' ' ')"
fi
errors=$(docker logs "$old" 2>&1 | grep -c -E '"level":"error"')
[ "$errors" = 0 ] && pass "$old_ref logged no error at start" || fail "$old_ref logged $errors error lines: $(docker logs "$old" 2>&1 | grep -m2 '"level":"error"' | cut -c1-200 | tr '\n' ' ')"
docker rm -f "$old" >/dev/null

echo "== 2. restore drill: pg_dump, a clean Postgres, this tree's node on it"
counts "$src" >"$work/before"
docker exec "$src" pg_dump -U relay -d relay_test -Fc >"$work/dump" || fail "pg_dump failed"
pass "dump: $(du -h "$work/dump" | cut -f1)"
pg_up "$dst" || exit 1
docker exec -i "$dst" pg_restore -U relay -d relay_test --no-owner --exit-on-error <"$work/dump" 2>"$work/restore.err" \
  && pass "pg_restore exit 0" || fail "pg_restore: $(head -3 "$work/restore.err" | tr '\n' ' ')"
counts "$dst" >"$work/after"
if diff -q "$work/before" "$work/after" >/dev/null; then pass "row counts identical in $(wc -l <"$work/before") tables"
else fail "row counts differ: $(diff "$work/before" "$work/after" | grep '^[<>]' | head -4 | tr '\n' ' ')"; fi
node_run "$new" "$new_tag" "$dst"
if body=$(health "$new"); then
  echo "$body" | grep -q '"database":"ok"' && pass "this tree's /health on the restored database: database ok" || fail "/health without the database: $body"
else
  fail "this tree's node did not answer /health on the restored database: $(docker logs "$new" 2>&1 | tail -3 | tr '\n' ' ')"
fi
for q in "SELECT key FROM brands" "SELECT id FROM api_keys" "SELECT count(*) FROM schema_migrations"; do
  pass "$q -> $(echo "$q" | sql "$dst" | tr '\n' ' ')"
done

echo "== migration leap: $([ "$fails" = 0 ] && echo GREEN || echo "RED ($fails)")"
[ "$fails" = 0 ]
