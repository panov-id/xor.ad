#!/usr/bin/env bash
# Prove the prune deletes what it should and keeps what it should, on the local
# stand — the only place where a view can be made genuinely old (the fs
# transport dates an object by its mtime).
#
# The interesting case is not "old files go": it is that a fresh view survives
# the same run, because a retention window that takes the whole collection with
# it would pass a test that only checks deletion.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
data="$root/relay/local/data"
views="$data/tenants/sosed/pageviews/local"

echo "== bringing up the local stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node >/dev/null
for _ in $(seq 30); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

send_view() { # $1 = path
  curl -sS -o /dev/null -X POST "$api/pageview" -H 'content-type: application/json' \
    --data "{\"path\":\"$1\",\"lang\":\"en\",\"source\":\"sosed.place-landing\"}"
}

echo
echo "== two views: one we will age, one we will not"
send_view /old/; sleep 1
send_view /fresh/
sleep 1

old_file="$(ls -t "$views"/*.json | tail -1)"
fresh_file="$(ls -t "$views"/*.json | head -1)"
# 200 days back: past any window this tool would sensibly be run with.
touch -d "200 days ago" "$old_file"
echo "   aged:  $(basename "$old_file")"
echo "   fresh: $(basename "$fresh_file")"
before="$(ls "$views"/*.json | wc -l)"

run_prune() {
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "$root/relay/node":/node -v "$data":/data -w /node \
    -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/data -e NODE_ENV_NAME=local \
    "$image" \
    deno run --allow-env --allow-read --allow-write tools/prune_pageviews.ts "$@"
}

echo
echo "== plan"
run_prune --days=90 | tail -8

echo
echo "== apply"
run_prune --days=90 --apply | tail -6

after="$(ls "$views"/*.json 2>/dev/null | wc -l)"
echo
echo "== result"
echo "   objects $before -> $after"
[ -f "$old_file" ] && { echo "   FAIL: the aged view survived"; exit 1; }
[ -f "$fresh_file" ] || { echo "   FAIL: the fresh view was taken too"; exit 1; }
echo "   the aged view is gone, the fresh one stayed: ok"

echo
echo "== a window below the floor is refused"
run_prune --days=1 --apply >/dev/null 2>&1 && { echo "   FAIL: accepted --days=1"; exit 1; }
echo "   --days=1 refused: ok"
