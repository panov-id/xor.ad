#!/usr/bin/env bash
# What happens to a client error whose key is wrong, and how loud a keyless
# request is. Both are answers this stand can give and no other test can: the
# first is a route's behaviour under a broken key, the second is about volume,
# which only shows up when you send more than one.
#
# Expected: a bad key is still answered 200 (a landing must never be silenced by
# the very channel it reports through), the record lands in the platform's
# unattributed collection, and a burst of keyless requests leaves one warn line
# rather than one per request.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml
data="$root/relay/local/data"

echo "== bringing up the local stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node >/dev/null
for _ in $(seq 30); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

mint() { # $1 = role, $2 = brand ("" for the platform)
  docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env tools/mint_panel_token.ts "$1" "$1@local" 3600 "$2" 2>/dev/null | tail -1
}

platform_token="$(mint admin '')"
neighbro_token="$(mint tenant_admin neighbro)"

post_error() { # $1 = message, $2 = api key ("" for none)
  local args=(-sS -o /dev/null -w '%{http_code}' -X POST "$api/client-error"
    -H "content-type: application/json")
  [ -n "$2" ] && args+=(-H "x-api-key: $2")
  curl "${args[@]}" --data "{\"kind\":\"verify\",\"message\":\"$1\",\"source\":\"sosed.place-landing\"}"
}

echo
echo "== a report with an unusable key is still accepted"
echo "   bad key:  HTTP $(post_error "bad key" ak_pub_deadbeefdeadbeefdead) (expect 200)"
echo "   no key:   HTTP $(post_error "no key" "") (expect 200)"

sleep 1
echo
echo "== where each landed"
unattributed="$data/client-errors-unattributed/local"
echo "   unattributed objects: $(ls "$unattributed" 2>/dev/null | wc -l) (expect 1+)"
echo "   the keyless one went to its hinted brand: tenants/sosed/client-errors/local"

echo
echo "== who may read the unattributed collection"
code() { curl -sS -o /dev/null -w '%{http_code}' -H "authorization: Bearer $1" "$api$2"; }
echo "   platform: HTTP $(code "$platform_token" '/admin/logs-client-errors?brand=unattributed') (expect 200)"
echo "   neighbro: HTTP $(code "$neighbro_token" '/admin/logs-client-errors?brand=unattributed') (expect 403)"

echo
echo "== a burst of keyless requests is one log line, not one per request"
before="$(ls "$data/server-logs/local" 2>/dev/null | wc -l)"
for index in 1 2 3 4 5; do post_error "keyless burst $index" "" >/dev/null; done
sleep 1
after="$(ls "$data/server-logs/local" 2>/dev/null | wc -l)"
echo "   stored server-log objects $before -> $after (expect unchanged after the first hour's line)"

echo
echo "Stand still running at $api — tear down with:"
echo "  docker compose -f relay/local/docker-compose.yml down"
