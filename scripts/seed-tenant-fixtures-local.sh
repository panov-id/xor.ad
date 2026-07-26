#!/usr/bin/env bash
# Seed a couple of neighbro records into the local stand's pre-tenancy root, so
# the tenant migration has something to actually split. The stand's existing
# records are all sosed, and a migration that only ever sees one brand proves
# nothing about the part that matters.
#
# Written in the legacy shape (straight into waitlist/<env>/ and
# client-errors/<env>/, not under tenants/), which is exactly what the migration
# is there to move.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_name="local"
waitlist_dir="$root/relay/local/data/waitlist/$env_name"
errors_dir="$root/relay/local/data/client-errors/$env_name"

mkdir -p "$waitlist_dir" "$errors_dir"

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
uuid() { uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())'; }

# A lead that names its brand, the way the node has always written it.
seed_lead() { # $1 = email
  local file="$waitlist_dir/$(hash_of "$1").json"
  cat > "$file" <<JSON
{
  "email": "$1",
  "source": "neighbro.place-landing",
  "brand": "neighbro",
  "lang": "en",
  "accent": null,
  "mode": null,
  "early_access": false,
  "node": "local",
  "region": "local",
  "env": "$env_name",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
JSON
  echo "   lead   -> ${file#"$root"/}"
}

# A client error, which never carried a brand — the migration has to infer it
# from the source, and this is the record that proves it does.
seed_error() {
  local file="$errors_dir/$(uuid).json"
  cat > "$file" <<JSON
{
  "kind": "fetch-failed",
  "message": "Failed to fetch /waitlist (neighbro fixture)",
  "stack": "TypeError: Failed to fetch",
  "page_url": "https://neighbro.place/",
  "user_agent": "seed-tenant-fixtures-local",
  "source": "neighbro.place-landing",
  "extra": null,
  "node": "local",
  "env": "$env_name",
  "received_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
JSON
  echo "   error  -> ${file#"$root"/}"
}

echo "== seeding neighbro fixtures into the pre-tenancy root"
seed_lead "fixture-neighbro-a@local.test"
seed_lead "fixture-neighbro-b@local.test"
seed_error
echo "done — now run scripts/migrate-tenants-local.sh to plan the split"
