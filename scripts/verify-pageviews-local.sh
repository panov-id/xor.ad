#!/usr/bin/env bash
# What the page counter records, against the local stand — and, more to the
# point, what it refuses to record. Sends a view with a query-bearing referrer
# and an exact viewport, then prints the stored object: the referrer must be
# reduced to a host, the width to a bucket, and nothing about the caller (no
# address, no user agent) may appear at all.
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

echo
echo "== a view, with everything a browser would offer"
curl -sS -o /dev/null -w '   HTTP %{http_code}\n' -X POST "$api/pageview" \
  -H "content-type: application/json" \
  -H "user-agent: Mozilla/5.0 (a very identifying string)" \
  --data '{
    "path": "/de/",
    "lang": "de",
    "referrer": "https://www.google.com/search?q=a+private+search",
    "viewport": 1913,
    "first_in_tab": true,
    "source": "sosed.place-landing"
  }'

sleep 1
echo
echo "== what was stored"
latest="$(ls -t "$data"/tenants/sosed/pageviews/local/*.json 2>/dev/null | head -1)"
if [ -z "$latest" ]; then
  echo "   nothing under tenants/sosed/pageviews/local — the view did not land" >&2
  exit 1
fi
cat "$latest" | python3 -m json.tool | sed 's/^/   /'

echo
echo "== the refusals"
for field in user_agent ip address remote_addr; do
  if grep -qi "\"$field\"" "$latest"; then
    echo "   FAIL: $field present"; exit 1
  fi
done
echo "   no user agent, no address: ok"
grep -q '"referrer_host": "www.google.com"' "$latest" &&
  echo "   referrer reduced to its host (the search terms are gone): ok" ||
  { echo "   FAIL: referrer not reduced"; exit 1; }
grep -q '"viewport": "desktop"' "$latest" &&
  echo "   viewport bucketed: ok" || { echo "   FAIL: viewport not bucketed"; exit 1; }

echo
echo "== reading it back through the panel route"
token="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 "" 2>/dev/null | tail -1)"
curl -sS -H "authorization: Bearer $token" "$api/admin/logs-pageviews?brand=sosed" |
  python3 -c '
import json, sys
page = json.load(sys.stdin)
rows = page.get("rows", [])
print("   {} row(s), matched={} total={}".format(len(rows), page.get("matched"), page.get("total")))
for row in rows[:3]:
    print("      {} {} <- {}".format(
        row.get("path"), row.get("lang"), row.get("referrer_host") or "direct"))
'

echo
echo "Stand still running at $api — tear down with:"
echo "  docker compose -f relay/local/docker-compose.yml down"
