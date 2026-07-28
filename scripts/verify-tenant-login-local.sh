#!/usr/bin/env bash
# What a tenant's operator actually experiences, end to end on the stand: the
# magic link, the session it mints, and the walls around it.
#
# This is the part of tenancy that tests cover but nobody had ever done: the
# tests call routes with a hand-signed token, which proves the boundary but not
# that a tenant can get through the front door at all.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:8081"
mailpit="http://localhost:8025"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml
tenant_email="tenant-boss@example.com"

echo "== bringing up the stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node mailpit >/dev/null
for _ in $(seq 30); do curl -fsS "$api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

mint_token() { # $1 = role, $2 = brand ("" = platform)
  docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env tools/mint_panel_token.ts "$1" "$1@local" 3600 "$2" 2>/dev/null | tail -1
}
platform="$(mint_token admin '')"

echo
echo "== the platform invites a tenant_admin for sosed"
# A tenant operator is created by someone who already has one foot in that
# tenant; here the platform does it and stamps the brand explicitly.
curl -sS -o /dev/null -w '   invite HTTP %{http_code}\n' -X POST "$api/admin/panel-users" \
  -H "authorization: Bearer $platform" -H 'content-type: application/json' \
  --data "{\"email\":\"$tenant_email\",\"role\":\"tenant_admin\",\"brand\":\"sosed\"}"

echo
echo "== the operator asks for a magic link"
curl -sS -o /dev/null -w '   request-link HTTP %{http_code}\n' -X POST "$api/auth/request-link" \
  -H 'content-type: application/json' --data "{\"email\":\"$tenant_email\"}"

sleep 2
echo "== the link, as it arrived in the mailbox"
link="$(curl -sS "$mailpit/api/v1/messages" |
  python3 -c '
import json, sys
messages = json.load(sys.stdin).get("messages", [])
print(messages[0]["ID"] if messages else "")
' )"
token="$(curl -sS "$mailpit/api/v1/message/$link" |
  python3 -c '
import json, re, sys
body = json.load(sys.stdin)
text = (body.get("Text") or "") + (body.get("HTML") or "")
found = re.search(r"token=([A-Za-z0-9._-]+)", text)
print(found.group(1) if found else "")
' )"
[ -n "$token" ] || { echo "   no token in the mail — stopping"; exit 1; }
echo "   token found (${#token} chars)"

echo
echo "== redeeming it for a session"
session="$(curl -sS "$api/auth/callback?token=$token" |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')"
[ -n "$session" ] || { echo "   redeem failed"; exit 1; }

as_tenant() { curl -sS -o /tmp/tenant.json -w '%{http_code}' -H "authorization: Bearer $session" "$api$1"; }

echo
echo "== who the panel thinks this is"
curl -sS -H "authorization: Bearer $session" "$api/auth/me" | python3 -m json.tool | sed 's/^/   /'

echo
echo "== what they may reach"
for path in /admin/waitlist /admin/api-keys /admin/logs-pageviews; do
  printf '   %-26s HTTP %s\n' "$path" "$(as_tenant "$path")"
done

echo
echo "== and what they may not"
for path in /admin/logs-server /admin/brands "/admin/logs-pageviews?brand=neighbro"; do
  printf '   %-34s HTTP %s (expect 403)\n' "$path" "$(as_tenant "$path")"
done

echo
echo "== a tenant cannot mint a platform administrator"
code="$(curl -sS -o /tmp/tenant.json -w '%{http_code}' -X POST "$api/admin/panel-users" \
  -H "authorization: Bearer $session" -H 'content-type: application/json' \
  --data '{"email":"escalation@example.com","role":"admin"}')"
echo "   HTTP $code (expect 403) — $(python3 -c 'import json;print(json.load(open("/tmp/tenant.json")).get("error",""))')"

echo
echo "== the key it mints belongs to its own brand, whatever it asks for"
curl -sS -X POST "$api/admin/api-keys" -H "authorization: Bearer $session" \
  -H 'content-type: application/json' --data '{"brand":"neighbro","origins":[]}' |
  python3 -c 'import json,sys; k=json.load(sys.stdin); print("   minted for:", k.get("brand", k.get("error")))'
