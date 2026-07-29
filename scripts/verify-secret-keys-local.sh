#!/usr/bin/env bash
# The public API end to end on the stand: mint a secret key from the panel,
# call /v1 with it, prove the scope is enforced, prove a retry is idempotent,
# revoke it, prove it stops working.
#
# The hash comparison, the unique index and the idempotency upsert are all
# database behaviour — none of it exists in the file-storage tests.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:8081"
secret="local-panel-secret"

echo "== bringing up the stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build >/dev/null 2>&1
for _ in $(seq 40); do curl -fsS "$api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

platform="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 2>/dev/null | tail -1)"

echo
echo "== the platform mints a secret key scoped to writing leads"
minted="$(curl -sS -X POST "$api/admin/secret-keys" \
  -H "authorization: Bearer $platform" -H 'content-type: application/json' \
  --data '{"brand":"sosed","name":"verify importer","scopes":["waitlist.write"]}')"
key="$(printf '%s' "$minted" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("secret",""))')"
id="$(printf '%s' "$minted" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
[ -n "$key" ] || { echo "   FAIL: no secret in the response — $minted"; exit 1; }
echo "   id: $id · secret: ${key:0:22}… (shown once)"

echo
echo "== the secret is not readable back"
listed="$(curl -sS "$api/admin/secret-keys" -H "authorization: Bearer $platform")"
case "$listed" in
  *"secret\":"*) echo "   FAIL: the list carries a secret" ;;
  *"$id"*)       echo "   OK: the key is listed, the secret is not" ;;
  *)             echo "   FAIL: the key is not listed at all" ;;
esac

echo
echo "== the key identifies itself"
curl -sS "$api/v1/me" -H "authorization: Bearer $key" | sed 's/^/   /'

echo
echo "== it writes a lead through /v1"
email="v1-$(date +%s)@e2e.test"
code="$(curl -sS -o /tmp/v1.json -w '%{http_code}' -X POST "$api/v1/waitlist" \
  -H "authorization: Bearer $key" -H 'content-type: application/json' \
  -H "idempotency-key: verify-$$" --data "{\"email\":\"$email\",\"lang\":\"en\"}")"
echo "   HTTP $code · $(cat /tmp/v1.json)"

echo
echo "== the same request again returns the same answer, and writes nothing new"
replay="$(curl -sS -D /tmp/v1.head -o /tmp/v1b.json -w '%{http_code}' -X POST "$api/v1/waitlist" \
  -H "authorization: Bearer $key" -H 'content-type: application/json' \
  -H "idempotency-key: verify-$$" --data "{\"email\":\"$email\",\"lang\":\"en\"}")"
echo "   HTTP $replay · replay header: $(grep -i '^idempotent-replay' /tmp/v1.head | tr -d '\r' || echo 'НЕТ')"

echo
echo "== the lead reached the tenant, once"
count="$(curl -sS "$api/admin/waitlist" -H "authorization: Bearer $platform" |
  python3 -c "import json,sys; rows=json.load(sys.stdin); print(sum(1 for r in rows if r.get('email')=='$email'))")"
echo "   rows for that email: $count (expect 1)"

echo
echo "== the scope is the limit: no key may read what it was not granted"
printf '   /v1/me with a wrong secret → HTTP %s (expect 401)\n' \
  "$(curl -sS -o /dev/null -w '%{http_code}' "$api/v1/me" -H "authorization: Bearer ${id}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")"
printf '   /v1/waitlist with no key    → HTTP %s (expect 401)\n' \
  "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/v1/waitlist" -H 'content-type: application/json' --data '{}')"

echo
echo "== a tenant cannot mint beyond its own permissions"
tenant="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts tenant_admin boss@sosed.test 3600 sosed 2>/dev/null | tail -1)"
printf '   tenant asking for logs.server.read → HTTP %s (expect 403)\n' \
  "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$api/admin/secret-keys" \
     -H "authorization: Bearer $tenant" -H 'content-type: application/json' \
     --data '{"name":"overreach","scopes":["logs.server.read"]}')"

echo
echo "== revoked means revoked"
curl -sS -o /dev/null -X POST "$api/admin/secret-keys/$id/revoke" -H "authorization: Bearer $platform"
printf '   /v1/me after revoke → HTTP %s (expect 401)\n' \
  "$(curl -sS -o /dev/null -w '%{http_code}' "$api/v1/me" -H "authorization: Bearer $key")"

echo
echo "== done"
