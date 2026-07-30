#!/usr/bin/env bash
# End-to-end check of the client-error log route against the local stand (fs
# storage), covering what unit tests cannot: the real listing, the time window,
# the cursor, the histogram and the permission guard.
#
# Seeds records with controlled timestamps, then asks the route for them. Leaves
# the stand running; the seeded records live in relay/local/data/client-errors.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml
# Records are a brand's, and live under its prefix (lib/scoped_storage.ts). The
# platform's default view merges the brands; the bare root collection is the
# pre-tenancy archive and is reachable only as ?brand=platform, so seeding there
# — as this script used to — asks the route for records it no longer looks at.
data="$root/relay/local/data"
sosed_dir="$data/tenants/sosed/client-errors/local"
neighbro_dir="$data/tenants/neighbro/client-errors/local"
archive_dir="$data/client-errors/local"

echo "== bringing up the local stand"
docker compose -f "$root/relay/local/docker-compose.yml" up -d --build node >/dev/null

for _ in $(seq 30); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

echo "== seeding client-error records with known timestamps"
rm -rf "$sosed_dir" "$neighbro_dir" "$archive_dir"
mkdir -p "$sosed_dir" "$neighbro_dir" "$archive_dir"
# fs storage reports mtime as the record's creation time, so the timestamps are
# set explicitly: minutes ago -> newest, days ago -> outside a short window.
seed() { # $1 = minutes ago, $2 = kind, $3 = message, $4 = directory
  local file="$4/$(uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())').json"
  cat > "$file" <<JSON
{
  "kind": "$2",
  "message": "$3",
  "stack": "at seed ($1 minutes ago)",
  "page_url": "https://sosed.place/",
  "user_agent": "verify-logs-local",
  "source": "sosed.place-landing",
  "extra": null,
  "node": "local",
  "env": "local",
  "received_at": "$(date -u -d "$1 minutes ago" +%Y-%m-%dT%H:%M:%S.000Z)"
}
JSON
  touch -d "$1 minutes ago" "$file"
}

# Across two brands, so the platform's default page proves it merges rather than
# reads one collection and stops.
seed 2 "fetch-failed" "Failed to fetch /waitlist" "$sosed_dir"
seed 7 "render" "Cannot read properties of undefined" "$neighbro_dir"
seed 20 "fetch-failed" "Failed to fetch /client-error" "$sosed_dir"
seed 90 "render" "Hydration mismatch" "$neighbro_dir"
seed 4320 "legacy" "Three days old — outside every short window" "$sosed_dir"
# The pre-tenancy archive: nothing writes here any more, and the default view no
# longer merges it, so its own record checks that ?brand=platform still opens it.
seed 30 "archive" "Written before tenancy, still readable" "$archive_dir"

echo "== minting session tokens"
mint() {
  docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env tools/mint_panel_token.ts "$1" "$1@local" 2>/dev/null | tail -1
}
admin_token="$(mint admin)"
viewer_token="$(mint viewer)"

route="/admin/logs-client-errors"
call() { # $1 = query, $2 = token ("" for none)
  if [ -n "$2" ]; then
    curl -sS -o /tmp/logs-body.json -w '%{http_code}' -H "authorization: Bearer $2" "$api$route$1"
  else
    curl -sS -o /tmp/logs-body.json -w '%{http_code}' "$api$route$1"
  fi
}

summary() { # reads /tmp/logs-body.json
  docker run --rm -v /tmp/logs-body.json:/body.json "$image" deno eval '
    const page = JSON.parse(await Deno.readTextFile("/body.json"));
    const bucketed = (page.buckets ?? []).reduce((sum, b) => sum + b.count, 0);
    console.log(`   rows=${page.rows?.length} matched=${page.matched} total=${page.total} ` +
      `truncated=${page.truncated} buckets=${page.buckets?.length} counted=${bucketed}`);
    console.log(`   newest: ${page.rows?.[0]?.message ?? "-"}`);
    console.log(`   oldest loaded: ${page.rows?.at(-1)?.message ?? "-"}`);
  ' 2>/dev/null
}

echo
echo "== whole collection (no window; expects the 5 brand records, merged, no archive)"
echo "   HTTP $(call '' "$admin_token")"
summary

echo
echo "== window: last 60 minutes (expects the 3 recent records)"
from="$(date -u -d '60 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)"
echo "   HTTP $(call "?from=$from" "$admin_token")"
summary

echo
echo "== limit=2 then the cursor page (expects no repeats)"
echo "   HTTP $(call '?limit=2' "$admin_token")"
summary
cursor="$(docker run --rm -v /tmp/logs-body.json:/body.json "$image" deno eval '
  const page = JSON.parse(await Deno.readTextFile("/body.json"));
  console.log(page.rows.at(-1).stored_at);' 2>/dev/null | tail -1)"
echo "   older than $cursor -> HTTP $(call "?limit=2&before=$cursor" "$admin_token")"
summary

echo
echo "== one brand (expects only sosed's 3)"
echo "   HTTP $(call '?brand=sosed' "$admin_token")"
summary

echo
echo "== the pre-tenancy archive (expects its 1 record, which no other view shows)"
echo "   HTTP $(call '?brand=platform' "$admin_token")"
summary

echo
echo "== guard and input validation"
echo "   viewer (no logs permission): HTTP $(call '' "$viewer_token") (expect 403)"
echo "   no token:                   HTTP $(call '' '') (expect 401)"
echo "   malformed from:             HTTP $(call '?from=yesterday' "$admin_token") (expect 422)"

echo
echo "Stand still running at $api — tear down with:"
echo "  docker compose -f relay/local/docker-compose.yml down"
