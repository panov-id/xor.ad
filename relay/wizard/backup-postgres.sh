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

# Overridable only so that scripts/check-backup-script.sh can run the script on a copy;
# on a box it is always the default.
cd "${RELAY_COMPOSE_DIR:-/opt/relay/compose}"
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
  echo "WARNING: BACKUP_STORAGE_ZONE and BACKUP_STORAGE_KEY are not both set —" >&2
  echo "         dumps share the working zone and its key," >&2
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
  # Транзит в копию не идёт: недоставленный шифротекст живёт до доставки,
  # а в дампе пролежал бы ещё keep_days дней (chat_RU.md §8.8, 12.09.2026).
  # The comment stands above the command, not inside it: a comment line after a
  # trailing backslash ends the command there, and from 2026-09-12 to 2026-09-15 it
  # sent `docker compose exec` with no command and ran pg_dump on the host — no dump
  # at all (final review panel, OPS-1). scripts/check-backup-script.sh guards it.
  docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
    pg_dump --clean --if-exists --no-owner --username relay \
      --exclude-table-data=pending_deliveries "${database}" \
    | gzip -9 > "${file}"

  size="$(stat -c %s "${file}")"
  if [ "${size}" -lt 512 ]; then
    # A dump this small is an error message, not a database.
    echo "refusing to upload ${database}: dump is ${size} bytes" >&2
    rm -f "${file}"
    continue
  fi

  # Encryption before the dump leaves the node, when there is a public key to do
  # it with. The Hetzner DPA (TOM appendix, p. 20) puts encryption of backups at
  # rest on us, and this dump is the whole database: names, ages, vault key
  # shares, the emails of Article 16 notifiers, the panel's audit log. It goes
  # to a third party's storage, so a leaked storage key used to hand over
  # everything.
  #
  # Hybrid, and deliberately: a random key for the data, the public key for that
  # random key. RSA cannot encrypt a gigabyte and AES cannot be given a key the
  # box does not hold — this is the usual way out of both. The box can write
  # backups and cannot read them, which is the property that makes it worth
  # doing at all (relay/wizard/new-backup-key.sh).
  remote="${stamp}.sql.gz"
  type="application/gzip"
  if [ -n "${BACKUP_PUBLIC_KEY:-}" ]; then
    pub="$(mktemp)"; datakey="$(mktemp)"; sealed="$(mktemp)"
    printf '%s' "${BACKUP_PUBLIC_KEY}" | base64 -d > "${pub}"
    # Both halves of the AES parameters, one per line, so the restore reads them
    # with `sed -n 1p` and `sed -n 2p` and nothing has to be parsed.
    printf '%s\n%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 16)" > "${datakey}"
    openssl enc -aes-256-cbc \
      -K "$(sed -n 1p "${datakey}")" -iv "$(sed -n 2p "${datakey}")" \
      -in "${file}" -out "${file}.enc"
    openssl pkeyutl -encrypt -pubin -inkey "${pub}" \
      -pkeyopt rsa_padding_mode:oaep -in "${datakey}" -out "${sealed}"

    curl -fsS -X PUT -H "AccessKey: ${key}" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@${sealed}" \
      "https://${host}/${zone}/backups/${environment}/postgres/${stamp}.key.enc" \
      >/dev/null

    shred -u "${datakey}" 2>/dev/null || rm -f "${datakey}"
    rm -f "${pub}" "${sealed}" "${file}"
    file="${file}.enc"
    remote="${stamp}.sql.gz.enc"
    type="application/octet-stream"
    size="$(stat -c %s "${file}")"
  else
    echo "WARNING: BACKUP_PUBLIC_KEY is not set — the dump goes to storage in the" >&2
    echo "         clear, and it is the whole database. Encryption of backups at" >&2
    echo "         rest is ours under the Art. 28 agreement, not the provider's." >&2
    echo "         Make a key with relay/wizard/new-backup-key.sh." >&2
  fi

  curl -fsS -X PUT \
    -H "AccessKey: ${key}" \
    -H "Content-Type: ${type}" \
    --data-binary "@${file}" \
    "https://${host}/${zone}/backups/${environment}/postgres/${remote}" \
    >/dev/null
  echo "uploaded ${database} (${size} bytes) as ${remote}"
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
