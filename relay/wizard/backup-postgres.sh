#!/usr/bin/env bash
# Dump every control-state database on this box into Bunny Storage.
#
# Deployed by the wizard to /opt/relay/backup-postgres.sh and run by a systemd
# timer. Kept on the box rather than pulled from a laptop, because a backup that
# only happens when someone remembers is not a backup.
#
# Reads /opt/relay/compose/backup.env: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY,
# BUNNY_STORAGE_HOST, POSTGRES_PASSWORD, DATABASES — and, when they are set,
# BACKUP_STORAGE_ZONE / BACKUP_STORAGE_KEY / BACKUP_STORAGE_HOST.
#
# Why the second zone. Until it exists the dumps live in the same storage zone as
# the node's working objects, reachable with the same key — so one leaked key, or
# one mistaken prune with a wrong prefix, takes the data and the backups
# together. A backup that dies with the thing it backs up is not a backup, it is
# a second copy. The separate zone is a person's action (a Bunny zone and a key
# of its own); this script uses it the moment it is there, and says out loud when
# it is not.
set -euo pipefail

cd /opt/relay/compose
set -a; . ./backup.env; set +a

# The backup zone if there is one, the working zone if there is not — and never
# silently: an operator reading the timer's log must be able to tell which of the
# two happened tonight.
zone="${BACKUP_STORAGE_ZONE:-}"
key="${BACKUP_STORAGE_KEY:-}"
if [ -n "${zone}" ] && [ -n "${key}" ]; then
  host="${BACKUP_STORAGE_HOST:-${BUNNY_STORAGE_HOST:-storage.bunnycdn.com}}"
  echo "backups go to their own zone (${zone})"
else
  zone="${BUNNY_STORAGE_ZONE}"
  key="${BUNNY_STORAGE_KEY}"
  host="${BUNNY_STORAGE_HOST:-storage.bunnycdn.com}"
  echo "WARNING: no BACKUP_STORAGE_ZONE — dumps share the working zone and its key," >&2
  echo "         so one leak or one mistaken prune takes the data and the backups." >&2
fi
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
# Keep a fortnight: control state is small, and two weeks is long enough to
# notice a corruption that a single night's dump would have already overwritten.
keep_days=14

for database in ${DATABASES}; do
  environment="${database#relay_}"
  file="/tmp/${database}-${stamp}.sql.gz"

  # --clean --if-exists so the dump restores onto a non-empty database without a
  # manual drop; the restore drill depends on that being true.
  docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
    pg_dump --clean --if-exists --no-owner --username relay "${database}" \
    | gzip -9 > "${file}"

  size="$(stat -c %s "${file}")"
  if [ "${size}" -lt 512 ]; then
    # A dump this small is an error message, not a database.
    echo "refusing to upload ${database}: dump is ${size} bytes" >&2
    rm -f "${file}"
    continue
  fi

  curl -fsS -X PUT \
    -H "AccessKey: ${key}" \
    -H "Content-Type: application/gzip" \
    --data-binary "@${file}" \
    "https://${host}/${zone}/backups/${environment}/postgres/${stamp}.sql.gz" \
    >/dev/null
  echo "uploaded ${database} (${size} bytes) as ${stamp}.sql.gz"
  rm -f "${file}"

  # Retention runs after a successful upload, never before: losing old dumps
  # because the new one failed is the exact shape of the disaster this guards
  # against.
  cutoff="$(date -u -d "${keep_days} days ago" +%Y-%m-%d)"
  listing="$(curl -fsS -H "AccessKey: ${key}" \
    "https://${host}/${zone}/backups/${environment}/postgres/" || echo '[]')"
  python3 - "$listing" "$cutoff" "$environment" <<'PY' | while read -r old; do
import json, sys
listing, cutoff, environment = sys.argv[1:4]
try:
    entries = json.loads(listing)
except Exception:
    entries = []
for entry in entries:
    name = entry.get("ObjectName", "")
    if name.endswith(".sql.gz") and name[:10] < cutoff:
        print(name)
PY
    curl -fsS -X DELETE -H "AccessKey: ${key}" \
      "https://${host}/${zone}/backups/${environment}/postgres/${old}" >/dev/null &&
      echo "  removed ${old} (older than ${keep_days} days)"
  done
done
