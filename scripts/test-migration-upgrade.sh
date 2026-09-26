#!/usr/bin/env bash
# The upgrade paths a live node can take: migrations up to some level applied,
# rows in every table alive at that level, and everything above applied on top.
#
# Why a check of its own: run-relay-database-tests.sh migrates an empty
# database from 001 every time, so a backfill runs over nothing and a
# migration that trips on an existing row never trips. Prod stands at 021; the
# level of dev is not measured (owner.md). So the upgrade is tried from 021 and
# from the level right before every backfill, each over its own throwaway
# Postgres, with the same tool (relay/node/tools/migrate_db.ts) a deploy runs.
#
# Nothing here is a list of migrations. A backfill is a migration that writes
# rows (UPDATE, INSERT, DELETE); its tables and the level each table is born at
# are read from db/. A backfill this script has no seed rows or no check for
# fails the run by name — a new 058 that writes rows cannot slip past.
#
# At each level it asserts, each with its own message:
#   - the upgrade exits 0 and records every file on disk in schema_migrations;
#   - the rows seeded at that level are still there (tables a later backfill
#     inserts into or deletes from are left to that backfill's own check);
#   - every backfill above the level whose tables were alive and seeded did
#     its work on those rows; one whose tables were born later is named as
#     "not on this path", and only then;
#   - a second run of the tool applies nothing;
#   - no jsonb column holds a JSON string (tools/check_jsonb_strings.ts).
#
#   scripts/test-migration-upgrade.sh                 # every derived level, in parallel
#   UPGRADE_FROM="021 046" scripts/test-migration-upgrade.sh
#   MIGRATIONS_DIR=<copy of relay/node/db> scripts/test-migration-upgrade.sh
#     # the same over a copy, to watch a broken backfill go red
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations="$(cd "${MIGRATIONS_DIR:-$root/relay/node/db}" && pwd)"
image="denoland/deno:alpine-2.1.4"
postgres_image="postgres:16-alpine"
live_base="021"   # where prod stands (deploy-state); always one of the levels
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

num() { basename "$1" | cut -d_ -f1; }
# A migration's statements with comments removed, one per line.
statements() { sed 's/--.*//' "$1" | tr '\n' ' ' | tr ';' '\n'; }

files=("$migrations"/*.sql)
last=$(num "${files[-1]}")
on_disk=${#files[@]}

# Tables by the level they are born at, and backfills with the tables they write.
declare -A born writes
for f in "${files[@]}"; do
  n=$(num "$f")
  for t in $(statements "$f" | grep -oiE '^\s*create table (if not exists )?[a-z_]+' | awk '{print tolower($NF)}'); do
    [ -n "${born[$t]:-}" ] || born[$t]=$n
  done
  w=$(statements "$f" | grep -oiE '^\s*(update|insert into|delete from)\s+[a-z_]+' | awk '{print tolower($NF)}' | sort -u | tr '\n' ' ')
  [ -z "$w" ] || writes[$n]="$w"
done
# The tables each check below reads. A migration with a check stays a backfill
# even if the rows it writes can no longer be seen in it — a backfill whose
# UPDATE went missing is the failure the check exists for, and deriving
# backfills from DML alone let exactly that pass green (breaks, 2026-09-26).
declare -A checked_on=(
  [006]="dsa_notices" [027]="feed_messages" [028]="identity_stats" [042]="jobs" [043]="dsa_notices"
  [046]="dsa_notices idempotency jobs nonces" [047]="identities" [049]="legal_acceptances")
for f in "${files[@]}"; do
  n=$(num "$f"); [ -n "${checked_on[$n]:-}" ] || continue
  writes[$n]=$(printf '%s\n' ${writes[$n]:-} ${checked_on[$n]} | sort -u | tr '\n' ' ')
done
backfills=$(printf '%s\n' "${!writes[@]}" | sort)

# Levels: prod's, and the one right before each backfill.
if [ -n "${UPGRADE_FROM:-}" ]; then
  levels="$UPGRADE_FROM"
else
  levels="$live_base"
  prev=""
  for f in "${files[@]}"; do
    n=$(num "$f")
    [ -n "${writes[$n]:-}" ] && [ -n "$prev" ] && levels="$levels $prev"
    prev=$n
  done
  levels=$(printf '%s\n' $levels | sort -u | tr '\n' ' ')
fi

# ---------- seed rows, by table: shaped like what the node wrote at the time ----------
# Fixed ids, so the checks can find them. One live job per kind (jobs_standing,
# db/020); one waiting phrase per author (feed_one_waiting, db/025). What a
# migration later repairs is written the old way only below that migration —
# `before N old new` — because above it the node no longer wrote it so, and a
# row no node ever wrote would be a failure this script made up.
I1=10000000-0000-4000-8000-000000000001   # away until two hours from now
I2=10000000-0000-4000-8000-000000000002   # was away, back
I3=10000000-0000-4000-8000-000000000003   # never away
S1=20000000-0000-4000-8000-000000000001
before() { if [ "$L" \< "$1" ]; then printf '%s' "$2"; else printf '%s' "$3"; fi; }
# jsonb written as a JSON string of itself, until db/046 unwrapped it.
js() { before 046 "to_jsonb('$1'::text)" "'$1'::jsonb"; }
declare -A expect=(
  [brands]=1 [api_keys]=1 [quota_counters]=1 [pageview_daily]=1 [idempotency]=2 [jobs]=3
  [dsa_notices]=2 [dsa_statements]=1 [identities]=3 [sessions]=1 [nonces]=1
  [legal_acceptances]=3 [feed_messages]=2 [identity_stats]=1)
seed_order="brands api_keys quota_counters pageview_daily idempotency jobs dsa_notices dsa_statements identities sessions nonces legal_acceptances feed_messages identity_stats"
seed_for() {  # <table>; $L is the level
  case "$1" in
    brands) echo "INSERT INTO brands (key, name, domain, sender, upper) VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA');" ;;
    api_keys) echo "INSERT INTO api_keys (id, brand, origins) VALUES ('ak_pub_upgradetest00000001', 'alpha', '{https://alpha.test}');" ;;
    quota_counters) echo "INSERT INTO quota_counters (key_id, counter, day, used) VALUES ('ak_pub_upgradetest00000001', 'events', '2026-09-01', 7);" ;;
    pageview_daily) echo "INSERT INTO pageview_daily (brand, day, path, lang, views, first_views) VALUES ('alpha', '2026-09-01', '/', 'ru', 10, 3);" ;;
    idempotency) cat <<SQL
INSERT INTO idempotency (key, brand, response) VALUES
  ('idem-string', 'alpha', $(js '{"status":200,"body":"ok"}')),
  ('idem-value',  'alpha', '{"status":201}'::jsonb);
SQL
    ;;
    jobs) cat <<SQL
INSERT INTO jobs (kind, payload, locked_until, attempts, created_at) VALUES
  ('mail', '{"to":"x@alpha.test"}', 'infinity', 8, '2026-08-01'),
  ('mail', '{"to":"y@alpha.test"}', NULL, 0, '2026-09-01'),
  ('prune', $(js '{"to":"z@alpha.test"}'), NULL, 0, '2026-09-02');
SQL
    ;;
    # Until db/006 a notice whose copy could not be taken said so in its status.
    dsa_notices) cat <<SQL
INSERT INTO dsa_notices (id, brand, target_kind, target_id, snapshot, reason_text, bona_fide, status, created_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'alpha', 'feed_message', 'm1', $(js '{"text":"old words"}'), 'unlawful', true,
   '$(before 006 target_gone received)', '2026-08-10 10:00+00'),
  ('00000000-0000-4000-8000-000000000002', 'alpha', 'other', NULL, '{"text":"a value"}'::jsonb, 'other reason', true,
   'in_review', '2026-08-11 11:00+00');
SQL
    ;;
    dsa_statements) echo "INSERT INTO dsa_statements (brand, notice_id, target_id, recipient_identity, restriction, facts, ground_kind, ground_text)
  VALUES ('alpha', '00000000-0000-4000-8000-000000000001', 'm1', 'someone', 'removed', 'facts', 'legal', 'ground');" ;;
    identities) cat <<SQL
INSERT INTO identities (id, name, age, identity_public_key, stepped_away_until) VALUES
  ('$I1', 'Аня', 30, 'pk1', now() + interval '2 hours'),
  ('$I2', 'Боря', 25, 'pk2', now() - interval '1 day'),
  ('$I3', 'Вера', 41, 'pk3', NULL);
SQL
    ;;
    sessions) echo "INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key) VALUES ('$S1', '$I1', 'spk', 'wpk');" ;;
    nonces) echo "INSERT INTO nonces (session_id, nonce, route, status, response) VALUES
  ('$S1', decode('00112233445566778899aabbccddeeff', 'hex'), 'POST /away', 200, $(js '{"until":1}'));" ;;
    # Two acceptances of one revision by I1, as the route wrote them before db/049.
    legal_acceptances) cat <<SQL
INSERT INTO legal_acceptances (identity, document, revision_date, revision_sha256, accepted_at) VALUES
  ('$I1', 'terms', '2026-09-01', 'sha-a', '2026-09-10 10:00+00'),
  ('$I1', 'terms', '2026-09-01', '$(before 049 sha-a sha-b)', '2026-09-10 10:05+00'),
  ('$I2', 'terms', '2026-09-01', 'sha-a', '2026-09-11 09:00+00');
SQL
    ;;
    feed_messages) cat <<SQL
INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, visible_at, expires_at) VALUES
  ('30000000-0000-4000-8000-000000000001', 'alpha', '$I1', 'живая', 'alone', 'ru', 41.9021, 12.4964, 1000, now() - interval '1 hour', now() + interval '3 hours'),
  ('30000000-0000-4000-8000-000000000002', 'alpha', '$I1', 'ждёт', 'company', 'ru', 59.9386, 30.3141, 300, NULL, NULL);
SQL
    ;;
    # I1 has its row already (the ON CONFLICT in db/028); I2 and I3 have none.
    identity_stats) echo "INSERT INTO identity_stats (identity, likes_received) VALUES ('$I1', 5);" ;;
  esac
}

# ---------- checks, by backfill: what it must have left on the seeded rows ----------
# Each prints "<expected>|<sql>"; the value the sql returns must equal expected.
check_006() { echo "received target_gone|SELECT status || ' ' || snapshot_state FROM dsa_notices WHERE target_id = 'm1'"; }
check_027() { echo "2|SELECT count(*) FROM feed_messages WHERE lat_published IS NOT NULL AND lon_published IS NOT NULL
  AND abs(lat_published - lat) <= area_radius / 111320.0 / 2 + 1e-9"; }
check_028() { echo "0 5|SELECT concat_ws(' ', (SELECT count(*) FROM identities i WHERE NOT EXISTS (SELECT 1 FROM identity_stats s WHERE s.identity = i.id)),
  (SELECT likes_received FROM identity_stats WHERE identity = '$I1'))"; }
check_042() { echo "1 0|SELECT concat_ws(' ', count(*) FILTER (WHERE locked_until = 'infinity' AND reported_at IS NOT NULL),
  count(*) FILTER (WHERE locked_until IS DISTINCT FROM 'infinity' AND reported_at IS NOT NULL)) FROM jobs"; }
check_043() { echo "2|SELECT count(*) FROM dsa_notices WHERE arrival_sent_at = created_at AND arrival_attempts = 0"; }
check_046() { echo "0 0 0 0|old words|200|z@alpha.test|SELECT concat_ws(' ', (SELECT count(*) FROM dsa_notices WHERE jsonb_typeof(snapshot) = 'string'),
  (SELECT count(*) FROM idempotency WHERE jsonb_typeof(response) = 'string'),
  (SELECT count(*) FROM jobs WHERE jsonb_typeof(payload) = 'string'),
  (SELECT count(*) FROM nonces WHERE jsonb_typeof(response) = 'string'))
  || '|' || concat_ws('|', (SELECT snapshot->>'text' FROM dsa_notices WHERE target_id = 'm1'),
  (SELECT response->>'status' FROM idempotency WHERE key = 'idem-string'),
  (SELECT payload->>'to' FROM jobs WHERE kind = 'prune'))"; }
check_047() { echo "t f f|SELECT concat_ws(' ', (SELECT away_wake_due FROM identities WHERE id = '$I1'),
  (SELECT away_wake_due FROM identities WHERE id = '$I2'), (SELECT away_wake_due FROM identities WHERE id = '$I3'))"; }
check_049() { echo "1 2026-09-10 10:00:00+00 1|SELECT concat_ws(' ', count(*) FILTER (WHERE identity = '$I1'),
  (SELECT to_char(min(accepted_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00' FROM legal_acceptances WHERE identity = '$I1'),
  count(*) FILTER (WHERE identity = '$I2')) FROM legal_acceptances"; }

# ---------- one level ----------
run_level() {
  local tag="relay-upgrade-$$-$1"
  local network="$tag-net" container="$tag-db" stage="$work/$L" url="postgres://relay:test@postgres:5432/relay_test"
  local fails=0 seeded="" rc
  L=$1   # seed_for and before read it
  mkdir -p "$stage/db"
  cleanup_level() { docker rm -fv "$container" >/dev/null 2>&1; docker network rm "$network" >/dev/null 2>&1; }
  trap cleanup_level RETURN
  docker network create "$network" >/dev/null
  docker run -d --name "$container" --network "$network" --network-alias postgres \
    -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$postgres_image" >/dev/null
  # Over TCP, for the reason run-relay-database-tests.sh gives at length.
  for _ in $(seq 60); do docker exec "$container" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
  sql() { docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U relay -d relay_test "$@"; }
  migrate() {
    docker run --rm --network "$network" -e DATABASE_URL="$url" \
      -v "$root/relay/node":/node -v "$1":/node/db:ro -w /node "$image" \
      deno run --allow-env --allow-net --allow-read tools/migrate_db.ts
  }
  fail() { echo "FAIL  [$L] $*"; fails=$((fails + 1)); }

  for f in "${files[@]}"; do [ "$(num "$f")" \> "$L" ] || cp "$f" "$stage/db/"; done
  migrate "$stage/db" > "$stage/base.log" 2>&1 || { fail "migrating up to $L failed: $(tail -3 "$stage/base.log" | tr '\n' ' ')"; return; }

  # Seed every table alive at this level, and nothing else.
  for t in $seed_order; do
    [ "$(sql -c "SELECT to_regclass('public.$t') IS NOT NULL")" = "t" ] || continue
    seed_for "$t" | sql >/dev/null 2>"$stage/seed.err" || { fail "the seed rows of $t do not fit its schema at $L: $(head -2 "$stage/seed.err" | tr '\n' ' ')"; return; }
    seeded="$seeded $t"
  done
  echo "      [$L] seeded:$seeded"

  # Every backfill above this level must be covered: seed rows for each table it
  # writes that lives here, and a check.
  local b t live missing
  for b in $backfills; do
    [ "$b" \> "$L" ] || continue
    for t in ${writes[$b]}; do
      [ -n "${born[$t]:-}" ] && ! [ "${born[$t]}" \> "$L" ] || continue
      [ -n "$(seed_for "$t")" ] || fail "$b writes $t, which lives at $L, and this script seeds no rows for it — add them"
    done
    declare -F "check_$b" >/dev/null || fail "$b writes rows (${writes[$b]% }) and this script has no check_$b — add one"
  done

  rc=0
  migrate "$migrations" > "$stage/upgrade.log" 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "the upgrade $L → $last over live rows exited $rc: $(sed 's/\x1b\[[0-9;]*m//g' "$stage/upgrade.log" | grep -iE 'error|refuse' | head -2 | tr '\n' ' ')"
    return
  fi
  local got expected q
  got=$(sql -c "SELECT count(*) FROM schema_migrations")
  [ "$got" = "$on_disk" ] || fail "schema_migrations holds $got, $on_disk files on disk"

  # Rows seeded here are still there — except where a backfill on this path
  # inserts or deletes by design; its own check speaks for that table.
  local grow=""
  for b in $backfills; do [ "$b" \> "$L" ] && grow="$grow $(statements "$migrations/${b}_"*.sql | grep -oiE '^\s*(insert into|delete from)\s+[a-z_]+' | awk '{print tolower($NF)}')"; done
  for t in $seeded; do
    case " $grow " in *" $t "*) continue ;; esac
    got=$(sql -c "SELECT count(*) FROM $t")
    [ "$got" = "${expect[$t]}" ] || fail "$t: seeded ${expect[$t]} rows at $L, $got after the upgrade"
  done

  for b in $backfills; do
    [ "$b" \> "$L" ] || continue
    live=""; missing=""
    for t in ${writes[$b]}; do case " $seeded " in *" $t "*) live="$live $t" ;; *) missing="$missing $t" ;; esac; done
    if [ -z "$live" ]; then echo "      [$L] not on this path: $b ($(echo $missing) born after $L)"; continue; fi
    declare -F "check_$b" >/dev/null || continue
    # "<expected>|SELECT …": the expected part may hold '|' itself.
    q=$("check_$b"); expected=${q%%|SELECT*}; q="SELECT${q#*|SELECT}"
    got=$(sql -c "$q" 2>&1)
    if [ "$got" = "$expected" ]; then echo "ok    [$L] $b over$live"; else fail "$b over$live: expected '$expected', got '$got'"; fi
  done

  local again
  again=$(migrate "$migrations" 2>&1 | tail -1)
  [ "$again" = "$on_disk migration(s) on disk, $on_disk already applied, 0 run now" ] || fail "the second run did not skip everything: $again"
  docker run --rm --network "$network" -e DATABASE_URL="$url" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env --allow-net --allow-read tools/check_jsonb_strings.ts > "$stage/jsonb.log" 2>&1 \
    || fail "a jsonb column holds a JSON string: $(tail -2 "$stage/jsonb.log" | tr '\n' ' ')"

  if [ "$fails" -eq 0 ]; then echo "ok    [$L] upgrade $L → $last: every check passed"; else echo "FAIL  [$L] upgrade $L → $last: $fails check(s) failed"; fi
}

echo "== backfills (from db/): $(for b in $backfills; do printf '%s(%s) ' "$b" "$(echo ${writes[$b]} | tr ' ' ',')"; done)"
echo "== levels: $levels→ $last"
for L in $levels; do run_level "$L" > "$work/level-$L.log" 2>&1 & done
wait
bad=0
for L in $levels; do
  echo; echo "== from $L"
  grep -v 'Download' "$work/level-$L.log"
  grep -q "^ok    \[$L\] upgrade" "$work/level-$L.log" || bad=$((bad + 1))
done
echo
n=$(echo $levels | wc -w)
if [ "$bad" -ne 0 ]; then echo "upgrade to $last: $bad of $n start level(s) failed"; exit 1; fi
echo "upgrade to $last: all $n start levels passed"
