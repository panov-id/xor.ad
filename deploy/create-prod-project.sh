#!/usr/bin/env bash
# Create a dedicated PROD Supabase project (separate from the shared dev+uat one)
# and save its ref/URL/keys/db-password under SUPABASE_PROD_* in deploy/.env.deploy
# WITHOUT touching the existing (shared) SUPABASE_* values.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env
: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN}"

NAME="${SUPABASE_PROD_NAME:-xor-prod}"
REGION="${SUPABASE_PROD_REGION:-eu-west-1}"
API="https://api.supabase.com/v1"
AUTH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
get(){ curl -sf -H "$AUTH" "$API$1"; }
post(){ curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" -d "$2" "$API$1"; }

# Reuse the org that owns the shared project (keeps billing/console together).
ORG=$(get "/projects/$SUPABASE_PROJECT_REF" | python3 -c "import sys,json;print(json.load(sys.stdin)['organization_id'])")
echo "org: $ORG · region: $REGION · name: $NAME"

REF=$(get "/projects" | python3 -c "import sys,json;print(next((p['id'] for p in json.load(sys.stdin) if p['name']==sys.argv[1]),''))" "$NAME")
if [ -z "$REF" ]; then
  DBPASS=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
  BODY=$(python3 -c "import json,sys;print(json.dumps({'name':sys.argv[1],'organization_id':sys.argv[2],'plan':'free','region':sys.argv[3],'db_pass':sys.argv[4]}))" "$NAME" "$ORG" "$REGION" "$DBPASS")
  REF=$(post "/projects" "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  echo "created: $REF — waiting for ACTIVE_HEALTHY…"
  for i in $(seq 1 80); do
    S=$(get "/projects/$REF" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
    [ "$S" = ACTIVE_HEALTHY ] && { echo " healthy."; break; }
    printf "."; sleep 6
  done
else
  echo "already exists: $REF"; DBPASS="(unchanged)"
fi

KEYS=$(get "/projects/$REF/api-keys")
ANON=$(echo "$KEYS" | python3 -c "import sys,json;print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='anon'))")
SERVICE=$(echo "$KEYS" | python3 -c "import sys,json;print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'))")
URL="https://$REF.supabase.co"

python3 - "$DEPLOY_DIR/.env.deploy" <<PY
import re
path="$DEPLOY_DIR/.env.deploy"
vals={"SUPABASE_PROD_REF":"$REF","SUPABASE_PROD_URL":"$URL",
      "SUPABASE_PROD_ANON_KEY":"$ANON","SUPABASE_PROD_SERVICE_ROLE_KEY":"$SERVICE"}
dbp="$DBPASS"
if dbp and dbp!="(unchanged)": vals["SUPABASE_PROD_DB_PASSWORD"]=dbp
c=open(path).read()
for k,v in vals.items():
    c = re.sub(rf'^{k}=.*$', f'{k}={v}', c, flags=re.M) if re.search(rf'^{k}=', c, re.M) else c.rstrip()+f"\n{k}={v}\n"
open(path,'w').write(c)
print("saved SUPABASE_PROD_* to .env.deploy:", ', '.join(vals))
PY
echo "PROD ref=$REF url=$URL anon=${ANON:0:24}…"
