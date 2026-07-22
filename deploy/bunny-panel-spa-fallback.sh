#!/usr/bin/env bash
# Configure SPA fallback for the panel storage zones: any missing path serves
# /index.html (Bunny Storage Custom404FilePath), so deep links like
# /auth/callback?token=... load the application instead of a bare 404.
# Then purge the matching pull zones so cached 404s are dropped.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env
: "${BUNNY_API_KEY:?Missing BUNNY_API_KEY}"

# name:storage_zone_id:pull_zone_id
ZONES="panel-dev:1637697:6118297 panel-uat:1638065:6118898 panel-prod:1640631:6123219"

for entry in $ZONES; do
  IFS=: read -r name storage_id pull_id <<< "$entry"
  echo "== $name: Custom404FilePath -> /index.html =="
  curl -sf -X POST "https://api.bunny.net/storagezone/$storage_id" \
    -H "AccessKey: $BUNNY_API_KEY" -H "Content-Type: application/json" \
    -d '{"Custom404FilePath": "/index.html"}'
  curl -sf -X POST "https://api.bunny.net/pullzone/$pull_id/purgeCache" \
    -H "AccessKey: $BUNNY_API_KEY" -H "Content-Length: 0"
  echo "  ok (cache purged)"
done
