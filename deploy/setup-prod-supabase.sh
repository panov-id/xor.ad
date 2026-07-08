#!/usr/bin/env bash
# Configure the fresh PROD Supabase project (after create-prod-project.sh +
# migrations): deploy edge functions + secrets, set Auth SMTP + prod-only
# allow-list, and wire the welcome-email app_config. Idempotent.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env
: "${SUPABASE_PROD_REF:?run create-prod-project.sh first}"
: "${SUPABASE_ACCESS_TOKEN:?}"; : "${RESEND_NEIGHBRO_KEY:?}"; : "${RESEND_PANOV_KEY:?}"

REF="$SUPABASE_PROD_REF"
PANEL="${PANEL_URL:-https://xor.panov.id}"
WELCOME_FROM_V="${WELCOME_FROM:-Neighbro <hello@neighbro.place>}"
FN_URL="https://$REF.supabase.co/functions/v1/send-waitlist-welcome"
MGMT="https://api.supabase.com/v1/projects/$REF"

# Prod welcome secret (persist to .env.deploy so it survives).
WSEC="${WELCOME_SECRET_PROD:-}"
if [ -z "$WSEC" ]; then
  WSEC=$(python3 -c "import secrets;print(secrets.token_hex(24))")
  printf '\nWELCOME_SECRET_PROD=%s\n' "$WSEC" >> "$DEPLOY_DIR/.env.deploy"
fi

echo "== 4a deploy edge functions to prod =="
docker run --rm -e SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" -e DO_NOT_TRACK=1 \
  -v "$ROOT_DIR/functions:/functions:ro" -w /root node:22-bookworm bash -lc "
    set -e
    for FN in invite-panel-user send-waitlist-welcome; do
      mkdir -p supabase/functions/\$FN
      cp /functions/\$FN/*.ts supabase/functions/\$FN/
      npx --yes supabase@latest functions deploy \$FN --project-ref $REF --use-api --no-verify-jwt
    done
    npx --yes supabase@latest secrets set --project-ref $REF \
      SITE_URL='$PANEL' \
      RESEND_API_KEY='$RESEND_NEIGHBRO_KEY' \
      'WELCOME_FROM=$WELCOME_FROM_V' \
      WELCOME_SECRET='$WSEC'
  " 2>&1 | grep -viE "npm warn|Downloading|Bundling|Deploying|notice|Deno|Setting secrets" | tail -8

echo "== 5 Auth: SMTP + prod-only allow-list =="
curl -s -X PATCH "$MGMT/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"site_url\":\"$PANEL\",\"uri_allow_list\":\"$PANEL\",\"smtp_admin_email\":\"no-reply@panov.id\",\"smtp_host\":\"smtp.resend.com\",\"smtp_port\":\"465\",\"smtp_user\":\"resend\",\"smtp_pass\":\"$RESEND_PANOV_KEY\",\"smtp_sender_name\":\"Xor\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  site_url:',d.get('site_url'),'| smtp:',d.get('smtp_host'),'| allow:',d.get('uri_allow_list'))"

echo "== 6 welcome app_config (url + secret) =="
curl -s -X POST "$MGMT/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data "$(python3 -c "import json;print(json.dumps({'query':\"insert into private.app_config(key,value) values ('welcome_url','$FN_URL'),('welcome_secret','$WSEC') on conflict (key) do update set value=excluded.value;\"}))")" >/dev/null
echo "  app_config set (welcome_url=$FN_URL)"
echo "PROD Supabase configured: $REF"
