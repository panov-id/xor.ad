#!/usr/bin/env bash
# Create (or find) the Supabase Cloud project via the Management API and write
# its URL + keys back into deploy/.env.deploy. Adapted from noisen-app.
# Docs: https://api.supabase.com/v1
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"
load_env

: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN in deploy/.env.deploy}"
: "${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD in deploy/.env.deploy (used to create the project)}"

PROJECT_NAME="${SUPABASE_PROJECT_NAME:-xor-ad}"
REGION="${SUPABASE_REGION:-eu-central-1}"
API="https://api.supabase.com/v1"
AUTH="Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"

sb_get()  { curl -sf -H "$AUTH" "${API}${1}"; }
sb_post() { curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" -d "$2" "${API}${1}"; }

echo "Fetching organizations…"
ORG_ID=$(sb_get "/organizations" | python3 -c "import sys,json; o=json.load(sys.stdin); print(o[0]['id'] if o else '')")
[ -n "$ORG_ID" ] || { echo "No organization found — create one in the Supabase dashboard first." >&2; exit 1; }
echo "Organization: $ORG_ID"

echo "Looking for project '$PROJECT_NAME'…"
PROJECT_REF=$(sb_get "/projects" | python3 -c "
import sys, json
p = next((x for x in json.load(sys.stdin) if x['name']==sys.argv[1]), None)
print(p['id'] if p else '')
" "$PROJECT_NAME")

if [ -z "$PROJECT_REF" ]; then
  echo "Creating project '$PROJECT_NAME' in $REGION…"
  BODY=$(python3 -c "
import json, sys
print(json.dumps({'name': sys.argv[1], 'organization_id': sys.argv[2], 'plan': 'free', 'region': sys.argv[3], 'db_pass': sys.argv[4]}))
" "$PROJECT_NAME" "$ORG_ID" "$REGION" "$SUPABASE_DB_PASSWORD")
  PROJECT_REF=$(sb_post "/projects" "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "Project created: $PROJECT_REF — waiting until healthy…"
  for i in $(seq 1 60); do
    STATUS=$(sb_get "/projects/${PROJECT_REF}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
    [ "$STATUS" = "ACTIVE_HEALTHY" ] && { echo "ready."; break; }
    printf "."; sleep 5
  done
else
  echo "Project exists: $PROJECT_REF"
fi

echo "Fetching API keys…"
KEYS=$(sb_get "/projects/${PROJECT_REF}/api-keys")
ANON_KEY=$(echo "$KEYS" | python3 -c "import sys,json; k=json.load(sys.stdin); print(next((x['api_key'] for x in k if x['name']=='anon'),''))")
SERVICE_KEY=$(echo "$KEYS" | python3 -c "import sys,json; k=json.load(sys.stdin); print(next((x['api_key'] for x in k if x['name']=='service_role'),''))")

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Write the values back into deploy/.env.deploy.
python3 - "$DEPLOY_DIR/.env.deploy" "$PROJECT_REF" "$SUPABASE_URL" "$ANON_KEY" "$SERVICE_KEY" <<'PY'
import sys, re
path, ref, url, anon, service = sys.argv[1:6]
with open(path) as f: c = f.read()
def setkv(c, k, v):
    if re.search(rf'^{k}=.*$', c, flags=re.M):
        return re.sub(rf'^{k}=.*$', f'{k}={v}', c, flags=re.M)
    return c + f'\n{k}={v}'
for k, v in [('SUPABASE_PROJECT_REF', ref), ('SUPABASE_URL', url),
             ('SUPABASE_ANON_KEY', anon), ('SUPABASE_SERVICE_ROLE_KEY', service)]:
    c = setkv(c, k, v)
with open(path, 'w') as f: f.write(c)
PY

echo ""
echo "════════════════════════════════════════════════"
echo " Supabase Cloud ready — written to deploy/.env.deploy"
echo " SUPABASE_URL=${SUPABASE_URL}"
echo " SUPABASE_ANON_KEY=${ANON_KEY:0:40}…"
echo "════════════════════════════════════════════════"
