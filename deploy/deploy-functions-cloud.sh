#!/usr/bin/env bash
# Deploy the invite-panel-user Edge Function to Supabase Cloud using the
# Supabase CLI (run in a throwaway Node container — nothing on the host).
#
# The CLI expects functions under supabase/functions/<name>, but ours live in
# functions/<name>, so we assemble a temporary supabase/ layout for the deploy.
# On Cloud, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
# platform; SITE_URL is set as a function secret below.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"
load_env

: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?Missing SUPABASE_PROJECT_REF}"
: "${PANEL_URL:?Missing PANEL_URL}"

FN="invite-panel-user"

# Assemble the supabase/ layout INSIDE the container (no host temp dir → no
# root-owned cleanup problems) and deploy via the Management API (--use-api),
# which needs no Docker bundling.
docker run --rm \
  -e SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  -v "$ROOT_DIR/functions/$FN/index.ts:/src/index.ts:ro" \
  -w /root \
  node:22-bookworm bash -lc "
    set -e
    mkdir -p supabase/functions/$FN
    cp /src/index.ts supabase/functions/$FN/index.ts
    npx --yes supabase@latest functions deploy $FN --project-ref $SUPABASE_PROJECT_REF --use-api --no-verify-jwt
    npx --yes supabase@latest secrets set SITE_URL=$PANEL_URL --project-ref $SUPABASE_PROJECT_REF
  "

echo "Deployed function '$FN' and set SITE_URL secret on ${SUPABASE_PROJECT_REF}."
