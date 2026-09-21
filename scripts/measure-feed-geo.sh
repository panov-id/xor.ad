#!/usr/bin/env bash
# What the feed's delivery query actually costs on a million phrases, and
# whether a different index would cost less.
#
# The review panel's data lens raised this on 2026-09-21: the index is a btree
# on (lat_published, lon_published), and a btree cannot use its second column
# as a range bound once the first one is a range — so the longitude half of the
# bounding box is a filter over everything the latitude band returns, which at
# 25 km is a strip of the world. The finding was reasoning about an index, not
# a measurement of one, and it said so. This is the measurement.
#
# Everything runs in Docker (nothing on the host) against the real schema:
# db/*.sql applied by the node's own migrator, so what is measured is the table
# the node has, indexes included.
#
#   bash scripts/measure-feed-geo.sh [rows]     # default 1000000
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rows="${1:-1000000}"
name="feed-geo-probe-$$"
image="denoland/deno:alpine-2.1.4"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== поднимаю Postgres 16 и применяю настоящие миграции =="
docker run -d --name "$name" -e POSTGRES_PASSWORD=probe -e POSTGRES_DB=probe \
  postgres:16-alpine -c shared_buffers=256MB -c work_mem=32MB >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker run --rm --network "container:$name" \
  -e DATABASE_URL="postgres://postgres:probe@127.0.0.1:5432/probe" \
  -e RELAY_DB_TIMEOUT_MS=1800000 \
  -v "$root/relay/node":/node -w /node "$image" \
  run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null

psql() { docker exec -i "$name" psql -U postgres -d probe -v ON_ERROR_STOP=1 "$@"; }

echo "== сею $rows фраз и 50000 авторов вокруг одной точки =="
psql -q <<SQL
-- Authors first: the delivery joins identities for the age band, so a million
-- phrases with one author would measure a join nobody will ever run.
INSERT INTO identities (id, name, age, identity_public_key)
SELECT gen_random_uuid(), 'seed', 13 + (i % 50), 'seed-key'
  FROM generate_series(1, 50000) AS i;

-- Phrases in clusters, because that is how they will actually lie: people are
-- in towns, not spread evenly over a region. Twenty centres scattered across
-- roughly four hundred kilometres, each about five kilometres wide, and one of
-- them exactly under the probe.
--
-- The first version of this seed spread everything uniformly over 130 km. It
-- ran, and it measured nothing: a two-kilometre circle caught 22 rows out of
-- 20000, the page of thirty never filled, and a plan that returns no rows
-- compares nothing. Written down because the mistake looks like a working
-- measurement.
INSERT INTO feed_messages
  (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
   lat_published, lon_published, visible_at, expires_at)
SELECT gen_random_uuid(), 'xor', a.id, 'засеянная фраза ' || i, 'alone', 'und',
       c.lat + (random() - 0.5) * 0.09, c.lon + (random() - 0.5) * 0.12,
       (ARRAY[100, 300, 1000, 3000, 10000])[1 + (i % 5)],
       c.lat + (random() - 0.5) * 0.09, c.lon + (random() - 0.5) * 0.12,
       now() - make_interval(secs => (i % 15000)),
       now() + make_interval(secs => 15600 - (i % 15000))
  FROM generate_series(1, $rows) AS i
  JOIN LATERAL (
    SELECT id FROM identities OFFSET floor(random() * 50000) LIMIT 1
  ) AS a ON true
  JOIN LATERAL (
    SELECT 41.9 + ((i % 20) - 10) * 0.31 AS lat,
           12.5 + (((i * 7) % 20) - 10) * 0.42 AS lon
  ) AS c ON true;

ANALYZE feed_messages;
ANALYZE identities;
SQL

psql -c "SELECT count(*)::text AS phrases FROM feed_messages" -t

# The delivery query of routes/feed.ts, with the parameters a viewer sends:
# 41.9/12.5, a kilometre of radius, an adult's band, first page.
read -r -d '' FEED <<'SQL' || true
SELECT f.id, f.text, f.mode, f.lang, f.lat_published, f.lon_published,
       f.area_radius, f.like_count,
       (extract(epoch from f.visible_at) * 1000000)::bigint::text AS visible_at_cursor,
       f.visible_at, a.age AS author_age
  FROM feed_messages f
  JOIN identities a ON a.id = f.author_identity
 WHERE f.visible_at IS NOT NULL AND f.expires_at > now()
   AND f.lat_published BETWEEN 41.5854 AND 42.2146
   AND f.lon_published BETWEEN 12.0774 AND 12.9226
   AND (CASE WHEN a.age <= 20 THEN 30 BETWEEN greatest(13, a.age - 2) AND a.age + 2
             ELSE 30 >= least(21, a.age - 2) END)
   AND sqrt(pow((f.lat_published - 41.9) * 111320, 2) +
            pow((f.lon_published - 12.5) * 111320 * cos(radians((f.lat_published + 41.9) / 2)), 2))
       <= f.area_radius + 1000
 ORDER BY f.visible_at DESC, f.id DESC
 LIMIT 30
SQL

run_plan() {
  local title="$1"
  echo
  echo "== $title =="
  # Twice: the first run pays for a cold cache and measures the disk, not the
  # plan. The second is the number to compare.
  psql -q -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $FEED" >/dev/null
  psql -t -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $FEED" \
    | grep -E "Index|Seq Scan|Bitmap|Sort|Limit|Execution Time|Rows Removed|Heap Blocks" \
    | sed 's/^[[:space:]]*/  /'
}

run_plan "плотное место: btree (lat_published, lon_published) из db/027"

# The other half of the truth. In a dense spot the cursor index fills a page of
# thirty almost at once, so the geometry never has to be selective. In an empty
# one it does not: the walk down visible_at has to pass everything in the world
# before it finds thirty in the circle — and that is the case the radius growth
# runs five times over.
SPARSE="${FEED//41.9/42.05}"
SPARSE="${SPARSE//12.5/12.71}"
SPARSE="${SPARSE//41.5854/41.7354}"
SPARSE="${SPARSE//42.2146/42.3646}"
SPARSE="${SPARSE//12.0774/12.2874}"
SPARSE="${SPARSE//12.9226/13.1326}"

echo
echo "== разрежённый край: тот же индекс, зонд между кучами =="
psql -q -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $SPARSE" >/dev/null
psql -t -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $SPARSE" \
  | grep -E "Index|Seq Scan|Bitmap|Sort|Limit|Execution Time|Rows Removed|Heap Blocks" \
  | sed 's/^[[:space:]]*/  /'


# The GiST index is the schema's own since db/029 (feed_live_geo_box), so it is
# already there: what is measured below is what the node runs, not an index
# this script made up for the occasion.

# The box form is what a GiST index on a point can answer; the BETWEEN pair
# cannot use it. Same rows, different way of asking.
BOX_FEED="${FEED/AND f.lat_published BETWEEN 41.5854 AND 42.2146
   AND f.lon_published BETWEEN 12.0774 AND 12.9226/AND point(f.lon_published, f.lat_published) <@ box(point(12.0774, 41.5854), point(12.9226, 42.2146))}"

echo
echo "== GiST по point(lon, lat), запрос через <@ box =="
psql -q -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $BOX_FEED" >/dev/null
psql -t -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $BOX_FEED" \
  | grep -E "Index|Seq Scan|Bitmap|Sort|Limit|Execution Time|Rows Removed|Heap Blocks" \
  | sed 's/^[[:space:]]*/  /'

# The sparse probe again, now that the GiST index exists and the query can ask
# in a form that uses it. This is the pair that actually decides: the dense
# case is answered by the cursor index either way.
SPARSE_BOX="${SPARSE/AND f.lat_published BETWEEN 41.7354 AND 42.3646
   AND f.lon_published BETWEEN 12.2874 AND 13.1326/AND point(f.lon_published, f.lat_published) <@ box(point(12.2874, 41.7354), point(13.1326, 42.3646))}"

echo
echo "== разрежённый край через GiST =="
psql -q -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $SPARSE_BOX" >/dev/null
psql -t -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) $SPARSE_BOX" \
  | grep -E "Index|Seq Scan|Bitmap|Sort|Limit|Execution Time|Rows Removed|Heap Blocks" \
  | sed 's/^[[:space:]]*/  /'

# --- the density handle --------------------------------------------------------
#
# GET /feed/density counts what the feed would deliver and answers a step, and
# the steps saturate: 100 and a million both read "hundreds". The data lens
# suggested counting at most a hundred for that reason. Counted here, not
# argued: the handle is what a slider calls on every move.
read -r -d '' DENSITY <<'SQL' || true
SELECT count(*)::text AS n
  FROM feed_messages f
  JOIN identities a ON a.id = f.author_identity
 WHERE f.visible_at IS NOT NULL AND f.expires_at > now()
   AND f.lat_published BETWEEN 41.5854 AND 42.2146
   AND f.lon_published BETWEEN 12.0774 AND 12.9226
   AND (CASE WHEN a.age <= 20 THEN 30 BETWEEN greatest(13, a.age - 2) AND a.age + 2
             ELSE 30 >= least(21, a.age - 2) END)
   AND sqrt(pow((f.lat_published - 41.9) * 111320, 2) +
            pow((f.lon_published - 12.5) * 111320 * cos(radians((f.lat_published + 41.9) / 2)), 2))
       <= f.area_radius + 1000
SQL

# The capped form: the same predicate inside, a hundred at most. The answer only
# ever needs to know whether it has reached a hundred.
CAPPED="SELECT count(*)::text AS n FROM (${DENSITY/SELECT count(*)::text AS n/SELECT 1} LIMIT 100) AS t"

plan() {  # plan <title> <query>
  echo
  echo "== $1 =="
  psql -q -c "EXPLAIN (ANALYZE, COSTS OFF) $2" >/dev/null
  psql -t -c "EXPLAIN (ANALYZE, COSTS OFF) $2" \
    | grep -E "Index Scan|Bitmap Index Scan|Seq Scan|Execution Time|Rows Removed" \
    | sed 's/^[[:space:]]*/  /'
}

plan "плотность, плотное место, как есть" "$DENSITY"
plan "плотность, плотное место, не больше ста" "$CAPPED"

SPARSE_DENSITY="${DENSITY//41.9/42.05}"
SPARSE_DENSITY="${SPARSE_DENSITY//12.5/12.71}"
SPARSE_DENSITY="${SPARSE_DENSITY//41.5854/41.7354}"
SPARSE_DENSITY="${SPARSE_DENSITY//42.2146/42.3646}"
SPARSE_DENSITY="${SPARSE_DENSITY//12.0774/12.2874}"
SPARSE_DENSITY="${SPARSE_DENSITY//12.9226/13.1326}"
plan "плотность, разрежённый край, как есть" "$SPARSE_DENSITY"

SPARSE_DENSITY_BOX="${SPARSE_DENSITY/AND f.lat_published BETWEEN 41.7354 AND 42.3646
   AND f.lon_published BETWEEN 12.2874 AND 13.1326/AND point(f.lon_published, f.lat_published) <@ box(point(12.2874, 41.7354), point(13.1326, 42.3646))}"
plan "плотность, разрежённый край, через box" "$SPARSE_DENSITY_BOX"

echo
echo "== размеры =="
psql -t -c "SELECT '  ' || indexrelname || '  ' || pg_size_pretty(pg_relation_size(indexrelid))
              FROM pg_stat_user_indexes WHERE relname = 'feed_messages' ORDER BY indexrelname"
psql -t -c "SELECT '  таблица  ' || pg_size_pretty(pg_relation_size('feed_messages'))"
