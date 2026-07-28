#!/usr/bin/env bash
# Restore the latest dump of an environment into a throwaway Postgres and compare
# it with the live database.
#
#   scripts/verify-backup-restore.sh dev
#
# This is the half of "we have backups" that usually goes missing. A dump nobody
# has restored is a file, not a backup: it can be truncated, be of the wrong
# database, or contain an error message where the schema should be, and nothing
# says so until the day it is needed.
#
# Runs entirely locally — the dump is pulled from Bunny Storage and restored into
# a container, so the live database is only ever read from.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
environment="${1:?usage: verify-backup-restore.sh <dev|staging|prod>}"

value_of() { grep -E "^$1=" "$root/relay/wizard/secrets.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
zone="$(value_of BUNNY_STORAGE_ZONE)"
storage_key="$(value_of BUNNY_STORAGE_KEY)"
host="${BUNNY_STORAGE_HOST:-storage.bunnycdn.com}"
prefix="backups/${environment}/postgres"

echo "== newest dump in ${prefix}"
latest="$(curl -fsS -H "AccessKey: ${storage_key}" "https://${host}/${zone}/${prefix}/" |
  python3 -c '
import json, sys
entries = [e["ObjectName"] for e in json.load(sys.stdin) if e["ObjectName"].endswith(".sql.gz")]
print(sorted(entries)[-1] if entries else "")
')"
[ -n "$latest" ] || { echo "   no dumps yet — has the timer run?" >&2; exit 1; }
echo "   $latest"

work="$(mktemp -d)"
trap 'rm -rf "$work"; docker rm -f relay-restore-check >/dev/null 2>&1 || true' EXIT
curl -fsS -H "AccessKey: ${storage_key}" \
  "https://${host}/${zone}/${prefix}/${latest}" -o "$work/dump.sql.gz"
echo "   $(stat -c %s "$work/dump.sql.gz") bytes downloaded"

echo
echo "== restoring into a throwaway Postgres"
docker run -d --name relay-restore-check -e POSTGRES_PASSWORD=check -e POSTGRES_USER=relay \
  -e POSTGRES_DB="relay_${environment}" postgres:16-alpine >/dev/null
for _ in $(seq 40); do
  docker exec relay-restore-check pg_isready -U relay >/dev/null 2>&1 && break
  sleep 1
done
gunzip -c "$work/dump.sql.gz" |
  docker exec -i -e PGPASSWORD=check relay-restore-check \
    psql -v ON_ERROR_STOP=1 -U relay -d "relay_${environment}" >/dev/null
echo "   restored without error"

echo
echo "== what came back"
docker exec -e PGPASSWORD=check relay-restore-check psql -U relay -d "relay_${environment}" -tAc "
  SELECT 'brands=' || (SELECT count(*) FROM brands)
      || ' keys=' || (SELECT count(*) FROM api_keys)
      || ' live_keys=' || (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL)
      || ' migrations=' || (SELECT count(*) FROM schema_migrations)
" | sed 's/^/   restored: /'

# The comparison that makes this a check rather than a demo: the same counts,
# read from the environment that is running.
echo
echo "== the live database, for comparison"
image="denoland/deno:alpine-2.1.4"
secret="$(value_of SESSION_SECRET)"
session="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 "" 2>/dev/null | tail -1)"
case "$environment" in
  dev) api="https://n1-dev.relay.panov.id" ;;
  staging) api="https://n1-staging.relay.panov.id" ;;
  prod) api="https://api.relay.panov.id" ;;
esac
curl -sS -H "authorization: Bearer $session" "$api/admin/api-keys" |
  python3 -c '
import json, sys
keys = json.load(sys.stdin)
live = [k for k in keys if not k.get("revoked_at")]
print(f"   live: keys={len(keys)} live_keys={len(live)}")
'
echo
echo "Counts should match, allowing for keys minted since the dump was taken."
