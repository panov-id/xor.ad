#!/usr/bin/env bash
# What a publishable key actually does, against the local stand: mints one for
# neighbro, then posts the same signup three ways and shows where each landed.
#
# The point is the third case: a key that says "neighbro" wins over a body and a
# source that both say sosed — the tenant is decided by the key, not by anything
# the caller can choose.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api="http://localhost:62080"
stamp="$(date +%s)"

echo "== bringing up the local stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node >/dev/null
for _ in $(seq 30); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

echo "== minting a publishable key for neighbro (any origin — local stand)"
key="$("$root/scripts/create-publishable-key-local.sh" neighbro 2>/dev/null | tail -1)"
echo "   $key"

post() { # $1 = email, $2 = key ("" for none), $3 = body brand
  local args=(-sS -o /dev/null -w '%{http_code}' -X POST "$api/waitlist"
    -H 'content-type: application/json'
    --data "{\"email\":\"$1\",\"source\":\"sosed.place-landing\",\"brand\":\"$3\",\"lang\":\"en\"}")
  [ -n "$2" ] && args+=(-H "x-api-key: $2")
  curl "${args[@]}"
}

echo
echo "== three signups"
keyless="keyless-$stamp@local.test"
keyed="keyed-$stamp@local.test"
lying="lying-$stamp@local.test"
echo "   no key, source+body say sosed:        HTTP $(post "$keyless" '' sosed)"
echo "   neighbro key, body says neighbro:     HTTP $(post "$keyed" "$key" neighbro)"
echo "   neighbro key, body claims sosed:      HTTP $(post "$lying" "$key" sosed)"

echo
echo "== an invalid key is refused outright"
echo "   x-api-key: ak_pub_deadbeefdeadbeef… -> HTTP $(post "invalid-$stamp@local.test" \
  ak_pub_deadbeefdeadbeefdeadbeefdeadbeef sosed) (expect 401)"

echo
echo "== where each landed"
for email in "$keyless" "$keyed" "$lying"; do
  hash="$(printf '%s' "$email" | sha256sum | cut -d' ' -f1)"
  found="$(find "$root/relay/local/data/tenants" -name "$hash.json" 2>/dev/null | head -1)"
  echo "   ${email%%@*}: ${found#"$root"/relay/local/data/}"
done

echo
echo "Stand still running at $api"
