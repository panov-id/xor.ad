#!/usr/bin/env bash
# E2: migration 080 (moderator_hints) on a database that already lives at 079
# and holds rows, and 080 run a second time. Everything in Docker: a throwaway
# Postgres, the node's own migrate tool, once with 080 held back and once whole.
#
#   relay/moderator/check-migration.sh     # prints what it checked; exit 0 when all held
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="denoland/deno:alpine-2.1.4"
network="moderator-migrate-$$"
db="moderator-migrate-db-$$"
url="postgres://relay:test@postgres:5432/relay_test"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
held="$(mktemp -d)"
cleanup() { docker rm -fv "$db" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; rm -rf "$held"; }
trap cleanup EXIT INT TERM

docker network create "$network" >/dev/null
docker run -d --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test postgres:16-alpine >/dev/null
for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
psql() { docker exec -i "$db" psql -v ON_ERROR_STOP=1 -qtA -U relay -d relay_test "$@"; }
migrate() {
  # shellcheck disable=SC2086
  docker run --rm --network "$network" -e DATABASE_URL="$url" $cache -v "$1":/node -w /node "$image" \
    deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null
}

# 1 · the node at 079: its sources with 080 held back.
cp -r "$root/relay/node/." "$held/"
rm "$held/db/080_moderator_hints.sql"
migrate "$held"
[ "$(psql -c "SELECT to_regclass('moderator_hints') IS NULL")" = "t" ] || { echo "RED: moderator_hints exists at 079"; exit 1; }
echo "ok   at 079: no moderator_hints yet"

# 2 · rows a live node holds: phrases, one queued and one published.
psql -c "INSERT INTO feed_messages (id, brand, text, mode, lang, lat, lon, area_radius, lat_published, lon_published, visible_at, expires_at)
         VALUES ('00000000-0000-4000-8000-000000000001', 'sosed', 'www.example.org', 'alone', 'und', 1, 1, 1000, 1, 1, NULL, NULL),
                ('00000000-0000-4000-8000-000000000002', 'sosed', 'гуляю у реки', 'alone', 'und', 1, 1, 1000, 1, 1, now(), now() + interval '1 hour')"
before=$(psql -c "SELECT count(*) FROM feed_messages")

# 3 · 079 → 080 over those rows.
migrate "$root/relay/node"
[ "$(psql -c "SELECT count(*) FROM schema_migrations WHERE name = '080_moderator_hints.sql'")" = "1" ] || { echo "RED: 080 not recorded"; exit 1; }
[ "$(psql -c "SELECT count(*) FROM feed_messages")" = "$before" ] || { echo "RED: phrases changed under 080"; exit 1; }
psql -c "INSERT INTO moderator_hints (feed_message_id, verdict, reason, model, ms) VALUES ('00000000-0000-4000-8000-000000000001', 'reject', 'a link', 'm', 5)"
echo "ok   079 → 080 over $before phrases: recorded, phrases kept, a hint written"

# 4 · 080 again, by hand and by the tool: nothing fails, nothing is lost.
docker exec -i "$db" psql -v ON_ERROR_STOP=1 -q -U relay -d relay_test < "$root/relay/node/db/080_moderator_hints.sql"
migrate "$root/relay/node"
[ "$(psql -c "SELECT count(*) FROM moderator_hints")" = "1" ] || { echo "RED: the hint was lost on a second run"; exit 1; }
echo "ok   080 run twice: no error, the hint kept"

# 5 · the hint goes with its phrase.
psql -c "DELETE FROM feed_messages WHERE id = '00000000-0000-4000-8000-000000000001'"
[ "$(psql -c "SELECT count(*) FROM moderator_hints")" = "0" ] || { echo "RED: a hint outlived its phrase"; exit 1; }
echo "ok   a phrase deleted takes its hint"
