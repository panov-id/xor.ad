#!/usr/bin/env bash
# End-to-end check of the server-log sink: provokes a real node error, then reads
# it back through the panel route.
#
# The error is genuine, not injected — Mailpit is stopped so the welcome email
# fails, which is exactly the kind of incident the panel page exists for. Mailpit
# is restarted afterwards.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
api="http://localhost:62080"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml
compose="$root/relay/local/docker-compose.yml"
data="$root/relay/local/data"

echo "== bringing up the local stand"
docker compose -f "$compose" up -d --build node >/dev/null
for _ in $(seq 30); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$api/health" >/dev/null || { echo "stand did not come up"; exit 1; }

echo "== clearing stored server logs"
rm -rf "$data/server-logs/local"
# Recreated empty: counting an absent directory makes ls exit non-zero, which
# under `set -o pipefail` would end the run before anything is checked.
mkdir -p "$data/server-logs/local"

stored_count() { find "$data/server-logs/local" -maxdepth 1 -name '*.json' | wc -l; }

echo "== provoking a real error: stopping Mailpit so the welcome email fails"
docker compose -f "$compose" stop mailpit >/dev/null

# Fresh addresses every run: the waitlist dedups on email and a repeat sends no
# second welcome email (routes/waitlist.ts), so reused addresses would provoke
# nothing and the check would pass by finding an empty collection.
run_id="$(date +%s)"
for suffix in a b c; do
  curl -sS -o /dev/null -X POST "$api/waitlist" -H 'content-type: application/json' \
    -d "{\"email\":\"sink-$run_id-$suffix@local.test\",\"source\":\"sosed.place-landing\",\"lang\":\"en\"}"
done

# The mail attempt is fire-and-forget and the SMTP lookup retries, so a failure
# can land several seconds after the response; the sink write is one hop after
# that. Waiting on the count settling beats guessing a duration.
settled=0
for _ in $(seq 20); do
  count="$(stored_count)"
  if [ "$count" -ge 3 ] && [ "$count" = "$settled" ]; then break; fi
  settled="$count"
  sleep 2
done

echo "== restarting Mailpit"
docker compose -f "$compose" start mailpit >/dev/null

echo "== stored server-log objects on disk: $(stored_count)"

mint() {
  docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
    deno run --allow-env tools/mint_panel_token.ts "$1" "$1@local.test" 2>/dev/null | tail -1
}

echo
echo "== reading them through the panel route"
code="$(curl -sS -o /tmp/server-logs-body.json -w '%{http_code}' \
  -H "authorization: Bearer $(mint admin)" "$api/admin/logs-server")"
echo "   HTTP $code"
docker run --rm -v /tmp/server-logs-body.json:/body.json "$image" deno eval '
  const page = JSON.parse(await Deno.readTextFile("/body.json"));
  console.log(`   ${page.rows.length} lines (matched=${page.matched} total=${page.total})`);
  for (const row of page.rows) {
    const extra = row.error ? ` :: ${String(row.error).slice(0, 80)}` : "";
    console.log(`   ${String(row.level).padEnd(5)} ${row.ts}  ${row.msg}${extra}`);
  }
' 2>/dev/null

echo
echo "== info lines are not stored (they would be one object per request)"
before="$(stored_count)"
for _ in $(seq 5); do curl -sS -o /dev/null "$api/health"; done
sleep 3
after="$(stored_count)"
if [ "$before" = "$after" ]; then
  echo "   5 healthy requests, objects $before -> $after: unchanged, as intended"
else
  echo "   FAIL: objects grew $before -> $after on healthy requests"
  exit 1
fi

echo
echo "== who may read them"
echo "   admin:     HTTP $(curl -sS -o /dev/null -w '%{http_code}' -H "authorization: Bearer $(mint admin)" "$api/admin/logs-server") (expect 200)"
echo "   moderator: HTTP $(curl -sS -o /dev/null -w '%{http_code}' -H "authorization: Bearer $(mint moderator)" "$api/admin/logs-server") (expect 403)"
