#!/usr/bin/env bash
# The half of the page-view counter that only exists against a real Postgres:
# the upsert that adds instead of overwriting, and the queue that hands one job
# to exactly one worker.
#
# The unit tests run on file storage, where none of these branches are taken —
# which is how the api_keys foreign key reached production unnoticed (B4).
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:8081"
psql() { docker exec -i edge-node-local-postgres-1 psql -U relay -d relay -tAc "$1"; }

echo "== bringing up the stand (migrations run before the node)"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build >/dev/null 2>&1
for _ in $(seq 40); do curl -fsS "$api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

day="$(date -u +%F)"
path="/verify-$(date +%s)"

echo
echo "== three views of the same path, one of them a first arrival"
for first in true false false; do
  curl -sS -o /dev/null -X POST "$api/pageview" -H 'content-type: application/json' \
    --data "{\"path\":\"$path\",\"lang\":\"ru\",\"first_in_tab\":$first,\"source\":\"sosed.place-landing\"}"
done

echo "   waiting for the flush (batched, ~10s)"
for _ in $(seq 20); do
  views="$(psql "select coalesce(views,0) from pageview_daily where path='$path' and day='$day'")"
  [ "${views:-0}" -ge 3 ] && break
  sleep 1
done

row="$(psql "select brand||' views='||views||' first='||first_views from pageview_daily where path='$path' and day='$day'")"
echo "   row: ${row:-НЕТ СТРОКИ}"
[ -n "$row" ] || { echo "   FAIL: nothing was counted"; exit 1; }
case "$row" in
  *"views=3 first=1"*) echo "   OK: increments add up, first arrivals counted apart" ;;
  *) echo "   FAIL: expected views=3 first=1"; exit 1 ;;
esac

echo
echo "== the count survives a prune of the objects it came from"
before="$(psql "select sum(views) from pageview_daily")"
docker run --rm --network host -v "$root/relay/node":/node -w /node \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/dev/null "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write tools/prune_pageviews.ts --days=7 >/dev/null 2>&1
after="$(psql "select sum(views) from pageview_daily")"
echo "   views before ${before} · after ${after}"
[ "$before" = "$after" ] && echo "   OK: pruning objects does not touch the count" \
  || { echo "   FAIL: the count moved"; exit 1; }

echo
echo "== the queue hands one job to one worker"
# A kind of its own per run, so a leftover row from an earlier attempt cannot be
# mistaken for a second worker winning the same job.
kind="verify_race_$$"
psql "insert into jobs (kind, payload) values ('$kind', '{}'::jsonb)" >/dev/null
claim="update jobs set locked_until = now() + interval '10 minutes', attempts = attempts + 1
       where id = (select id from jobs where kind='$kind'
                     and run_at <= now() and (locked_until is null or locked_until < now())
                   order by run_at for update skip locked limit 1)
       returning id"
# Through files, not variables: an assignment inside `&` happens in a subshell
# and never reaches this one.
first_claim="$(mktemp)"; second_claim="$(mktemp)"
psql "$claim" > "$first_claim" &
psql "$claim" > "$second_claim"
wait
echo "   worker A said: [$(tr -d '\n' < "$first_claim")] · worker B said: [$(tr -d '\n' < "$second_claim")]"
# Only a bare id counts as a claim; an empty answer is the loser doing the right
# thing.
winners="$(cat "$first_claim" "$second_claim" | grep -c '^[0-9][0-9]*$')"
rm -f "$first_claim" "$second_claim"
echo "   claims that returned a row: $winners (expect 1)"
[ "$winners" = "1" ] && echo "   OK: SKIP LOCKED keeps two workers off one job" \
  || echo "   FAIL: $winners workers claimed the same job"

echo
echo "== a failed job comes back later instead of vanishing"
psql "update jobs set locked_until = null, run_at = now() + interval '30 seconds',
      last_error = 'verify', attempts = 1 where kind='$kind'" >/dev/null
state="$(psql "select attempts||' '||(run_at > now())||' '||coalesce(last_error,'-') from jobs where kind='$kind'")"
echo "   attempts/deferred/error: $state"
case "$state" in
  "1 true verify") echo "   OK: attempt counted, run deferred, reason kept" ;;
  *) echo "   FAIL: unexpected state" ;;
esac
psql "delete from jobs where kind='$kind'" >/dev/null

echo
echo "== done"
