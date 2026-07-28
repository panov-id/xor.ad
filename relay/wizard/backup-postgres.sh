#!/usr/bin/env bash
# Dump every control-state database on this box into Bunny Storage.
#
# Deployed by the wizard to /opt/relay/backup-postgres.sh and run by a systemd
# timer. Kept on the box rather than pulled from a laptop, because a backup that
# only happens when someone remembers is not a backup.
#
# Reads /opt/relay/compose/backup.env: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY,
# BUNNY_STORAGE_HOST, POSTGRES_PASSWORD, DATABASES.
set -euo pipefail

cd /opt/relay/compose
set -a; . ./backup.env; set +a

host="${BUNNY_STORAGE_HOST:-storage.bunnycdn.com}"
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
    -H "AccessKey: ${BUNNY_STORAGE_KEY}" \
    -H "Content-Type: application/gzip" \
    --data-binary "@${file}" \
    "https://${host}/${BUNNY_STORAGE_ZONE}/backups/${environment}/postgres/${stamp}.sql.gz" \
    >/dev/null
  echo "uploaded ${database} (${size} bytes) as ${stamp}.sql.gz"
  rm -f "${file}"

  # Retention runs after a successful upload, never before: losing old dumps
  # because the new one failed is the exact shape of the disaster this guards
  # against.
  cutoff="$(date -u -d "${keep_days} days ago" +%Y-%m-%d)"
  listing="$(curl -fsS -H "AccessKey: ${BUNNY_STORAGE_KEY}" \
    "https://${host}/${BUNNY_STORAGE_ZONE}/backups/${environment}/postgres/" || echo '[]')"
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
    curl -fsS -X DELETE -H "AccessKey: ${BUNNY_STORAGE_KEY}" \
      "https://${host}/${BUNNY_STORAGE_ZONE}/backups/${environment}/postgres/${old}" >/dev/null &&
      echo "  removed ${old} (older than ${keep_days} days)"
  done
done
