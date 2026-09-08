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

# `|| true` is the whole difference between a check and a coin flip. Under
# `set -euo pipefail` a grep that matches nothing exits 1, and the assignment
# `x="$(value_of MISSING)"` then kills the script — before any test of the value
# can report what was missing. That is exactly how this file died for weeks one
# line after printing "restored without error": asked for a name that does not
# exist (SESSION_SECRET, when the secrets are per environment), it stopped
# without a word and the comparison never ran. Now a missing name yields an empty
# string, and the caller says which one it was.
value_of() {
  grep -E "^$1=" "$root/relay/wizard/secrets.env" 2>/dev/null | head -1 | cut -d= -f2- |
    sed 's/^"//; s/"$//' || true
}
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
# Waiting for the database, not for the server. `pg_isready` answers during
# initdb, while the entrypoint's temporary server is up and `relay_<env>` does
# not exist yet — so the restore raced it and died with "database does not
# exist", which reads like a broken dump and is not one. Ask for the thing that
# is actually needed.
ready=""
for _ in $(seq 60); do
  if docker exec -e PGPASSWORD=check relay-restore-check \
      psql -U relay -d "relay_${environment}" -tAc 'SELECT 1' >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 1
done
[ -n "$ready" ] || { echo "   relay_${environment} never became reachable in the container" >&2; exit 1; }
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

# The secret is per environment — SESSION_SECRET_DEV and friends. Asking for a
# bare SESSION_SECRET returned nothing, and under `set -euo pipefail` the script
# died right here, silently, one line after printing "restored without error".
# Which means the comparison below — the half that makes this a check rather than
# a demo — had never run. Found 08.09.2026 by a review panel; the restore itself
# was fine, the proof of it was not.
upper="$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
secret="$(value_of "SESSION_SECRET_${upper}")"
[ -n "$secret" ] || {
  echo "   SESSION_SECRET_${upper} is empty in relay/wizard/secrets.env — cannot ask the live node" >&2
  exit 1
}

# The token names its environment too, and a node refuses one minted for another
# (tools/mint_panel_token.ts). Without NODE_ENV_NAME the mint takes the default
# and every request answers 401 — the same way the screenshot sweep was quietly
# photographing a login page until this morning.
session="$(docker run --rm -e SESSION_SECRET="$secret" -e NODE_ENV_NAME="$environment" \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env tools/mint_panel_token.ts admin admin@local 3600 "" 2>/dev/null | tail -1)"
[ -n "$session" ] || { echo "   could not mint a session for $environment" >&2; exit 1; }
case "$environment" in
  dev) api="https://n1-dev.relay.panov.id" ;;
  staging) api="https://n1-staging.relay.panov.id" ;;
  prod) api="https://api.relay.panov.id" ;;
esac
# The status is checked before the body is parsed. A 401 used to reach python as
# a JSON object with an "error" key, and `len(keys)` on a dict counts its keys —
# so a refused request printed a plausible number and the comparison looked done.
live_body="$work/live.json"
status="$(curl -sS -o "$live_body" -w '%{http_code}' \
  -H "authorization: Bearer $session" "$api/admin/api-keys")"
[ "$status" = "200" ] || {
  echo "   $api/admin/api-keys answered $status — no comparison was made" >&2
  head -c 200 "$live_body" >&2; echo >&2
  exit 1
}
python3 -c '
import json, sys
keys = json.load(open(sys.argv[1]))
if not isinstance(keys, list):
    raise SystemExit(f"   expected a list of keys, got {type(keys).__name__}")
live = [k for k in keys if not k.get("revoked_at")]
print(f"   live: keys={len(keys)} live_keys={len(live)}")
' "$live_body"
echo
echo "Counts should match, allowing for keys minted since the dump was taken."
