#!/usr/bin/env bash
# What each kind of operator actually sees, against the local stand: the
# platform, a tenant, and a tenant reaching for someone else's data.
#
# Run it around the migration (scripts/migrate-tenants-local.sh) — before
# --apply, after --apply, and after --delete — and the counts tell the story:
# the platform double-counts while both spaces hold the same records, and stops
# once the originals are gone.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml

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

rows() { # $1 = token, $2 = path — prints "HTTP <code> rows=<n>"
  local code
  code="$(curl -sS -o /tmp/tenants-body.json -w '%{http_code}' \
    -H "authorization: Bearer $1" "$api$2")"
  local count
  count="$(docker run --rm -v /tmp/tenants-body.json:/body.json "$image" deno eval '
    const body = JSON.parse(await Deno.readTextFile("/body.json"));
    console.log(Array.isArray(body) ? body.length : (body.rows?.length ?? "-"));
  ' 2>/dev/null | tail -1)"
  echo "HTTP $code rows=$count"
}

echo
echo "== waitlist"
echo "   platform:         $(rows "$platform_token" /admin/waitlist)"
echo "   neighbro tenant:  $(rows "$neighbro_token" /admin/waitlist)"

echo
echo "== client-error log"
echo "   platform (own scope):    $(rows "$platform_token" /admin/logs-client-errors)"
echo "   platform (?brand=sosed): $(rows "$platform_token" '/admin/logs-client-errors?brand=sosed')"
echo "   neighbro (own):          $(rows "$neighbro_token" /admin/logs-client-errors)"
echo "   neighbro (?brand=sosed): $(rows "$neighbro_token" '/admin/logs-client-errors?brand=sosed') (expect 403)"

echo
echo "== platform-only surfaces"
echo "   platform  /admin/brands:      $(rows "$platform_token" /admin/brands)"
echo "   neighbro  /admin/brands:      $(rows "$neighbro_token" /admin/brands) (expect 403)"
echo "   neighbro  /admin/logs-server: $(rows "$neighbro_token" /admin/logs-server) (expect 403)"

echo
echo "Stand still running at $api — tear down with:"
echo "  docker compose -f relay/local/docker-compose.yml down"
