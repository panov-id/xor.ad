#!/usr/bin/env bash
# Give the local stand a panel user, then sign that user in the way a real
# environment does — by letter.
#
# The panel is invite-only and has no self-service registration, which on a real
# box is the point: the first operator is created by whoever owns the platform.
# On the stand it left a closed circle — `POST /admin/panel-users` needs
# `panel_users.write`, and the only way to hold it is to already be a user. So a
# fresh stand could not be signed into at all: `POST /auth/request-link` answers
# 204 to everything and sends nothing to an address it does not know, on purpose,
# so the failure is completely silent. Nothing in Mailpit, nothing in the log.
#
# This breaks the circle the same way the wizard does on a real box: mint a
# session token from the stand's own secret, and use it once.
#
# Roles are the relay's own (src/access/roles.ts): admin, moderator, viewer,
# tenant_admin. A brand's operator is a tenant_admin — "admin" is the platform
# role and carries the wildcard, so it is refused inside a brand.
#
#   bash scripts/create-panel-user-local.sh                     # admin@local.test, platform admin
#   bash scripts/create-panel-user-local.sh me@local.test admin
#   bash scripts/create-panel-user-local.sh ops@sosed.test tenant_admin sosed
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
email="${1:-admin@local.test}"
role="${2:-admin}"
brand="${3:-}"

api="http://localhost:62080"
mailpit="http://localhost:62025"
deno_image="denoland/deno:alpine-2.1.4"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml

curl -fsS -m 5 "$api/health" >/dev/null || {
  echo "the stand is not answering on $api — start it with" >&2
  echo "  docker compose -f relay/local/docker-compose.yml up -d" >&2
  exit 1
}

echo "== a session to create the first user with"
token="$(docker run --rm -e SESSION_SECRET="$secret" \
  -v "$root/relay/node":/node -w /node "$deno_image" \
  deno run --allow-env tools/mint_panel_token.ts admin bootstrap@local.test 600 2>/dev/null | tail -1)"

echo "== creating $email ($role${brand:+, brand $brand})"
# Built with an if rather than `$(… && printf …)`: a command substitution whose
# test fails exits non-zero, and under `set -e` that kills the assignment itself —
# silently, which is a poor way to learn that a brand was not given.
if [ -n "$brand" ]; then
  body="{\"email\":\"$email\",\"role\":\"$role\",\"brand\":\"$brand\"}"
else
  body="{\"email\":\"$email\",\"role\":\"$role\"}"
fi
response="$(curl -sS -X POST "$api/admin/panel-users" \
  -H "authorization: Bearer $token" -H 'content-type: application/json' \
  -d "$body" -w '\n%{http_code}')"
status="$(printf '%s' "$response" | tail -1)"
payload="$(printf '%s' "$response" | sed '$d')"

# The route writes the user object over whatever was there and answers 200 every
# time — there is no "already exists" to handle. Running this twice is therefore
# safe, and the second run is how you get a fresh link for a user you already have.
case "$status" in
  201|200) echo "   ok: $payload" ;;
  *)       echo "   POST /admin/panel-users -> $status: $payload" >&2; exit 1 ;;
esac

# A platform administrator gets no invitation by design (only a tenant's operator
# does — see tryInvite), so the letter to look for is the sign-in link, asked for
# exactly as the login form asks for it.
echo "== asking for a sign-in link, as the login form would"
before="$(curl -fsS "$mailpit/api/v1/messages?limit=1" | python3 -c 'import json,sys; print(json.load(sys.stdin)["total"])' 2>/dev/null || echo 0)"
curl -fsS -X POST "$api/auth/request-link" \
  -H 'content-type: application/json' -d "{\"email\":\"$email\"}" -o /dev/null

echo "== waiting for it in Mailpit"
# The reader is a file, not a one-liner threaded through two levels of quoting:
# the URL goes in as an environment variable and the pattern is a plain regex, so
# neither the shell nor the JSON can mangle it.
reader="$(mktemp)"
trap 'rm -f "$reader"' EXIT
cat > "$reader" <<'PYTHON'
import json, os, re, sys, urllib.request

mailpit = os.environ["MAILPIT"]
# Only letters addressed to this user. A token signs whoever it was minted for
# in, so taking the first link in the mailbox would hand you someone else's
# session on a stand that has more than one operator — and it would look like it
# worked.
wanted = os.environ["EMAIL"].lower()
listing = json.load(urllib.request.urlopen(f"{mailpit}/api/v1/messages?limit=25"))
for message in listing.get("messages", []):
    recipients = {(to.get("Address") or "").lower() for to in message.get("To", [])}
    if wanted not in recipients:
        continue
    body = json.load(urllib.request.urlopen(f"{mailpit}/api/v1/message/{message['ID']}"))
    text = (body.get("Text") or "") + " " + (body.get("HTML") or "")
    found = re.search(r"https?://[^\s\"'<>]*/auth/callback\?token=[a-f0-9]+", text)
    if found:
        print(found.group(0))
        sys.exit(0)
sys.exit(1)
PYTHON

link=""
for _ in $(seq 20); do
  link="$(MAILPIT="$mailpit" EMAIL="$email" python3 "$reader" 2>/dev/null || true)"
  [ -n "$link" ] && break
  sleep 1
done

echo
if [ -n "$link" ]; then
  echo "  sign in:  $link"
else
  echo "  no link arrived. Letters now in Mailpit: $(curl -fsS "$mailpit/api/v1/messages?limit=1" | python3 -c 'import json,sys; print(json.load(sys.stdin)["total"])') (was $before)"
  echo "  open $mailpit and look, or check the node's log: docker logs edge-node-local-node-1 --tail 20"
fi
echo "  Mailpit:  $mailpit"
