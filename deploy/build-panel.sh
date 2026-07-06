#!/usr/bin/env bash
# Production build of the admin panel (Vite) in a throwaway Node container.
# Reads panel/.env.production for VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
# Output: panel/dist.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"

if [ ! -f "$ROOT_DIR/panel/.env.production" ]; then
  echo "Missing panel/.env.production — copy panel/.env.production.example and fill it in." >&2
  exit 1
fi

echo "Building panel (production)…"
docker run --rm -v "$ROOT_DIR/panel:/app" -w /app node:22-bookworm \
  bash -lc "npm install && npm run build"

echo "Built → panel/dist"
