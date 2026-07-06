#!/usr/bin/env bash
# Apply db/migrations/*.sql to the Supabase Cloud project, in order, via the
# Management API database/query endpoint. Adapted from noisen-app.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/lib.sh"
load_env

: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?Missing SUPABASE_PROJECT_REF (run setup-supabase-cloud.sh first)}"

for file in "$ROOT_DIR"/db/migrations/*.sql; do
  echo "Applying $(basename "$file")…"
  BODY=$(python3 -c 'import sys,json; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$file")
  curl -sf -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    >/dev/null && echo "  ok" || { echo "  FAILED"; exit 1; }
done

echo "All migrations applied to ${SUPABASE_PROJECT_REF}."
