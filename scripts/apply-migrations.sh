#!/usr/bin/env bash
# Applies db/migrations/*.sql, in order, against the running local Postgres
# (the supabase-db container from the vendored stack).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for file in db/migrations/*.sql; do
  echo "Applying $file"
  docker exec -i supabase-db psql -U postgres -d postgres < "$file"
done
