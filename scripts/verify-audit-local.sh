#!/usr/bin/env bash
# End-to-end check of the audit trail against the local stand: performs real panel
# mutations (applied and refused) and then reads them back through the audit route.
#
# Starts from an empty panel-users and audit state on the stand, so the events it
# prints are exactly the ones it caused.
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

echo "== clearing panel users and audit trail on the stand"
rm -rf "$data/audit/local" "$data/panel/local/users"

mint() {
  docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env tools/mint_panel_token.ts "$1" "$1@local.test" 2>/dev/null | tail -1
}
admin_token="$(mint admin)"
moderator_token="$(mint moderator)"

call() { # $1 = method, $2 = path, $3 = token, $4 = body (optional)
  if [ -n "${4:-}" ]; then
    curl -sS -o /dev/null -w '%{http_code}' -X "$1" -H "authorization: Bearer $3" \
      -H 'content-type: application/json' -d "$4" "$api$2"
  else
    curl -sS -o /dev/null -w '%{http_code}' -X "$1" -H "authorization: Bearer $3" "$api$2"
  fi
}

echo
echo "== performing panel actions"
echo "   create admin@local.test:            HTTP $(call POST /admin/panel-users "$admin_token" '{"email":"admin@local.test","role":"admin"}')"
echo "   create helper@local.test:           HTTP $(call POST /admin/panel-users "$admin_token" '{"email":"helper@local.test","role":"moderator"}')"
echo "   demote helper -> viewer:       HTTP $(call PATCH /admin/panel-users/helper@local.test "$admin_token" '{"role":"viewer"}')"
echo "   delete helper@local.test:           HTTP $(call DELETE /admin/panel-users/helper@local.test "$admin_token")"
echo "   moderator tries to create:     HTTP $(call POST /admin/panel-users "$moderator_token" '{"email":"sneaky@local.test","role":"admin"}') (expect 403)"
echo "   delete the last admin:         HTTP $(call DELETE /admin/panel-users/admin@local.test "$admin_token") (expect 409)"

echo
echo "== reading the audit trail back"
code="$(curl -sS -o /tmp/audit-body.json -w '%{http_code}' \
  -H "authorization: Bearer $admin_token" "$api/admin/logs-audit")"
echo "   HTTP $code"
docker run --rm -v /tmp/audit-body.json:/body.json "$image" deno eval '
  const page = JSON.parse(await Deno.readTextFile("/body.json"));
  console.log(`   ${page.rows.length} events (matched=${page.matched} total=${page.total})`);
  for (const event of page.rows) {
    const change = event.outcome === "denied"
      ? `refused: ${event.reason}`
      : `${event.before?.role ?? "-"} -> ${event.after?.role ?? "-"}`;
    console.log(`   ${event.outcome.padEnd(7)} ${event.action.padEnd(24)} ` +
      `${String(event.target ?? "-").padEnd(16)} by ${event.actor_email}  ${change}`);
  }
' 2>/dev/null

echo
echo "== a moderator may read the audit trail, a viewer may not"
echo "   moderator: HTTP $(call GET /admin/logs-audit "$moderator_token") (expect 200)"
echo "   viewer:    HTTP $(call GET /admin/logs-audit "$(mint viewer)") (expect 403)"
