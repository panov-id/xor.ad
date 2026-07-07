#!/usr/bin/env bash
# Restart the Supabase edge-functions container so it picks up edited
# function source (the Deno edge runtime caches modules in memory).
set -euo pipefail

docker restart supabase-edge-functions >/dev/null
echo "Restarted supabase-edge-functions; waiting for it to accept requests..."

for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \
    http://localhost:8000/functions/v1/invite-panel-user --max-time 3 || true)"
  if [ "$code" != "000" ]; then
    echo "Edge functions responding (OPTIONS -> $code)."
    exit 0
  fi
  sleep 1
done

echo "Edge functions did not come back in time." >&2
exit 1
