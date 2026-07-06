#!/usr/bin/env bash
# Deploy one target's static files to its Bunny Storage Zone and purge the
# Pull Zone cache. Reuses the noisen-app upload+purge pattern.
#
# Usage: deploy-cdn.sh <sosed|neighbro|panel>
#
# For the landings, config.js is regenerated at deploy time to point at the
# Supabase Cloud project (the committed config.js stays local same-origin).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"
load_env

TARGET="${1:?Usage: deploy-cdn.sh <sosed|neighbro|panel>}"

case "$TARGET" in
  sosed)
    SRC="$ROOT_DIR/sosed.place/landing"; IS_LANDING=1
    ZONE="${BUNNY_SOSED_STORAGE_ZONE:?}"; KEY="${BUNNY_SOSED_STORAGE_KEY:?}"; PULL="${BUNNY_SOSED_PULL_ZONE_ID:-}"; SRC_TAG="sosed.place-landing" ;;
  neighbro)
    SRC="$ROOT_DIR/neighbro.place/landing"; IS_LANDING=1
    ZONE="${BUNNY_NEIGHBRO_STORAGE_ZONE:?}"; KEY="${BUNNY_NEIGHBRO_STORAGE_KEY:?}"; PULL="${BUNNY_NEIGHBRO_PULL_ZONE_ID:-}"; SRC_TAG="neighbro.place-landing" ;;
  panel)
    SRC="$ROOT_DIR/panel/dist"; IS_LANDING=0
    ZONE="${BUNNY_PANEL_STORAGE_ZONE:?}"; KEY="${BUNNY_PANEL_STORAGE_KEY:?}"; PULL="${BUNNY_PANEL_PULL_ZONE_ID:-}" ;;
  *) echo "Unknown target: $TARGET" >&2; exit 1 ;;
esac

[ -d "$SRC" ] || { echo "Source dir not found: $SRC (build the panel first?)" >&2; exit 1; }

BASE_URL="https://storage.bunnycdn.com/${ZONE}"
PURGE_KEY="${BUNNY_API_KEY:-$KEY}"

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

upload_file() {
  local local_path="$1" remote_path="$2"
  echo "  → /${remote_path}"
  curl -sS -X PUT \
    -H "AccessKey: ${KEY}" \
    -H "Content-Type: $(mime_type "$local_path")" \
    --data-binary "@${local_path}" \
    "${BASE_URL}/${remote_path}" >/dev/null
}

# Landings: stage into a temp dir and inject the prod config.js.
STAGE="$SRC"
if [ "$IS_LANDING" = "1" ]; then
  : "${SUPABASE_URL:?Missing SUPABASE_URL (run setup-supabase-cloud.sh first)}"
  : "${SUPABASE_ANON_KEY:?Missing SUPABASE_ANON_KEY}"
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  cp -R "$SRC/." "$STAGE/"
  cat > "$STAGE/config.js" <<EOF
// Generated at deploy time — points the ${SRC_TAG} landing at Supabase Cloud.
window.__XOR_CONFIG__ = {
  supabaseUrl: "${SUPABASE_URL}",
  supabaseAnonKey: "${SUPABASE_ANON_KEY}",
};
EOF
  # SPEC/readme files don't belong on the CDN.
  rm -f "$STAGE"/SPEC_*.md
fi

echo "Deploying '$TARGET' → Bunny zone '$ZONE'"
( cd "$STAGE" && find . -type f -print0 | while IFS= read -r -d '' f; do
    upload_file "$f" "${f#./}"
  done )

if [ -n "$PULL" ]; then
  echo "Purging pull zone ${PULL}…"
  curl -sS -X POST -H "AccessKey: ${PURGE_KEY}" \
    "https://api.bunny.net/pullzone/${PULL}/purgeCache" >/dev/null
  echo "  cache purged."
else
  echo "  (no pull zone id — skipping cache purge)"
fi

echo "Done: $TARGET."
