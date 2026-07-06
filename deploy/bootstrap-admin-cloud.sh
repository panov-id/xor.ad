#!/usr/bin/env bash
# Create the first panel admin on Supabase Cloud: make the auth user (email
# pre-confirmed) via the Auth Admin API, then insert the panel_users row via
# the Management API. Usage: bootstrap-admin-cloud.sh <email>
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"
load_env

: "${SUPABASE_URL:?Missing SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Missing SUPABASE_SERVICE_ROLE_KEY}"
: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?Missing SUPABASE_PROJECT_REF}"

EMAIL="${1:?Usage: bootstrap-admin-cloud.sh <email>}"

echo "Creating auth user $EMAIL…"
RESP=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EMAIL}\", \"email_confirm\": true}")
USER_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
[ -n "$USER_ID" ] || { echo "Failed to create user: $RESP" >&2; exit 1; }

echo "Inserting panel_users row (admin)…"
SQL="insert into public.panel_users (id, email, role) values ('${USER_ID}', '${EMAIL}', 'admin') on conflict (id) do update set role='admin';"
BODY=$(python3 -c 'import sys,json; print(json.dumps({"query": sys.argv[1]}))' "$SQL")
curl -sf -X POST \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" >/dev/null

echo "Admin ${EMAIL} ready. Sign in via the panel (magic link needs SMTP configured in Supabase Auth)."
