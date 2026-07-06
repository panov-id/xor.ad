#!/usr/bin/env bash
# CI panel deploy: upload a prebuilt panel/dist to a Bunny Storage Zone and
# purge its Pull Zone. The Vite build (with VITE_SUPABASE_* env) runs in the
# workflow before this. Reads plain env vars, no .env.deploy needed.
#
# Required env: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY
# Optional env: BUNNY_PULL_ZONE_ID, BUNNY_API_KEY
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT_DIR/panel/dist"

: "${BUNNY_STORAGE_ZONE:?}"
: "${BUNNY_STORAGE_API_KEY:?}"
[ -d "$DIST" ] || { echo "panel/dist not found — build the panel first." >&2; exit 1; }

BASE_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}"
PURGE_KEY="${BUNNY_API_KEY:-$BUNNY_STORAGE_API_KEY}"

mime_type() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.ico)  echo "image/x-icon" ;;
    *.woff2) echo "font/woff2" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

echo "Deploying panel dist → Bunny zone '${BUNNY_STORAGE_ZONE}'"
( cd "$DIST" && find . -type f -print0 | while IFS= read -r -d '' f; do
    rel="${f#./}"
    echo "  → /${rel}"
    curl -sS -X PUT \
      -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
      -H "Content-Type: $(mime_type "$f")" \
      --data-binary "@${f}" \
      "${BASE_URL}/${rel}" >/dev/null
  done )

if [ -n "${BUNNY_PULL_ZONE_ID:-}" ]; then
  echo "Purging pull zone ${BUNNY_PULL_ZONE_ID}…"
  curl -sS -X POST -H "AccessKey: ${PURGE_KEY}" \
    "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache" >/dev/null
  echo "  cache purged."
fi

echo "Panel deployed."
