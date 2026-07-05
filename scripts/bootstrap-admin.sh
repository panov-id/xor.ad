#!/usr/bin/env bash
# Creates the first panel admin directly via the Supabase Auth Admin API
# (service role key, local only) and inserts the matching panel_users row.
# Subsequent panel users go through the in-app invite flow instead.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMAIL="${1:?Usage: bootstrap-admin.sh <email>}"

SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' "$ROOT_DIR/supabase/.env" | cut -d= -f2-)
SUPABASE_URL="http://localhost:8000"

echo "Creating auth user for $EMAIL..."
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"email_confirm\": true}")

USER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
  echo "Failed to create user. Response:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

echo "Created auth user $USER_ID — inserting panel_users row (role: admin)..."
docker exec -i supabase-db psql -U postgres -d postgres \
  -c "insert into public.panel_users (id, email, role) values ('$USER_ID', '$EMAIL', 'admin');"

echo "Done. Generate a sign-in link with:"
echo "  curl -s -X POST '$SUPABASE_URL/auth/v1/admin/generate_link' -H \"apikey: \$SERVICE_ROLE_KEY\" -H \"Authorization: Bearer \$SERVICE_ROLE_KEY\" -H 'Content-Type: application/json' -d '{\"type\": \"magiclink\", \"email\": \"$EMAIL\"}'"
