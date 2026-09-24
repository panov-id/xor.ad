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
# Everything this script writes to disk is the database, so nobody else on the
# host gets to read it: umask 077, and one private working directory that is
# removed however the script ends. Until 2026-09-21 the dump went to a
# predictable /tmp name with the unit's umask (0644 at 022), and a failure
# midway — a network error on the upload, a malformed key — left it there in
# the clear, with the data key beside it (review panel, second pass).
umask 077
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

# The key is checked before anything is dumped. A malformed key used to be
# discovered after the dump was on disk, by which point `set -e` had stopped the
# script and left it there — and no database got a backup that night at all.
if [ -n "${BACKUP_PUBLIC_KEY:-}" ]; then
  if ! printf '%s' "${BACKUP_PUBLIC_KEY}" | base64 -d > "${work}/public.pem" 2>/dev/null \
     || ! openssl pkey -pubin -in "${work}/public.pem" -noout 2>/dev/null; then
    echo "refusing to run: BACKUP_PUBLIC_KEY is set but is not a base64 PEM public key" >&2
    exit 1
  fi
fi

# The marker of a good night (watchdog С7) goes to the WORKING zone whichever
# zone the dumps chose: the node reads it with its own key, and the backup
# zone's key stays off the node (relay/node/src/lib/backup_watch.ts).
marker_zone="${BUNNY_STORAGE_ZONE}"
marker_key="${BUNNY_STORAGE_KEY}"
marker_host="${BUNNY_STORAGE_HOST:-storage.bunnycdn.com}"

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
# Keep a fortnight: control state is small, and two weeks is long enough to
# notice a corruption that a single night's dump would have already overwritten.
keep_days=14

for database in ${DATABASES}; do
  environment="${database#relay_}"
  # --clean --if-exists so the dump restores onto a non-empty database without a
  # manual drop; the restore drill depends on that being true.
  # Транзит в копию не идёт: недоставленный шифротекст живёт до доставки,
  # а в дампе пролежал бы ещё keep_days дней (chat_RU.md §8.8, 12.09.2026).
  # The comment stands above the command, not inside it: a comment line after a
  # trailing backslash ends the command there, and from 2026-09-12 to 2026-09-15 it
  # sent `docker compose exec` with no command and ran pg_dump on the host — no dump
  # at all (final review panel, OPS-1). scripts/check-backup-script.sh guards it.
  dump() {
    docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
      pg_dump --clean --if-exists --no-owner --username relay \
        --exclude-table-data=pending_deliveries "${database}"
  }

  if [ -n "${BACKUP_PUBLIC_KEY:-}" ]; then
    # Encrypted on the way through, so the plain dump never touches the disk at
    # all: pg_dump | gzip | openssl enc. The Hetzner DPA puts encryption of
    # backups at rest on us (TOM appendix, p. 20), and this dump is the whole
    # database.
    #
    # Hybrid, and deliberately: a random passphrase for the data, the public key
    # for that passphrase. The box can write backups and cannot read them, which
    # is the property that makes this worth doing (new-backup-key.sh).
    #
    # The passphrase is read from a file, not passed on the command line. The
    # first version gave the AES key as `-K <hex>`, which put it in argv — in
    # `ps` and /proc/<pid>/cmdline for as long as a large dump took to encrypt.
    file="${work}/${database}.sql.gz.enc"
    head -c 48 /dev/urandom | base64 -w0 > "${work}/passphrase"
    dump | gzip -9 | openssl enc -aes-256-cbc -pbkdf2 -salt \
      -pass "file:${work}/passphrase" -out "${file}"
    openssl pkeyutl -encrypt -pubin -inkey "${work}/public.pem" \
      -pkeyopt rsa_padding_mode:oaep -in "${work}/passphrase" -out "${work}/sealed"
    rm -f "${work}/passphrase"
    remote="${stamp}.sql.gz.enc"
    type="application/octet-stream"
  else
    file="${work}/${database}.sql.gz"
    dump | gzip -9 > "${file}"
    remote="${stamp}.sql.gz"
    type="application/gzip"
    echo "WARNING: BACKUP_PUBLIC_KEY is not set — the dump goes to storage in the" >&2
    echo "         clear, and it is the whole database. Encryption of backups at" >&2
    echo "         rest is ours under the Art. 28 agreement, not the provider's." >&2
    echo "         Make a key with relay/wizard/new-backup-key.sh." >&2
  fi

  size="$(stat -c %s "${file}")"
  if [ "${size}" -lt 512 ]; then
    # A dump this small is an error message, not a database — encrypted or not,
    # the salt adds sixteen bytes, not five hundred.
    echo "refusing to upload ${database}: dump is ${size} bytes" >&2
    rm -f "${file}" "${work}/sealed"
    continue
  fi

  # The dump first, the sealed passphrase second. The other order left a key
  # with no dump behind it whenever the dump's upload failed; this one leaves at
  # worst a dump nobody can open, which is visibly incomplete.
  curl -fsS -X PUT \
    -H "AccessKey: ${key}" \
    -H "Content-Type: ${type}" \
    --data-binary "@${file}" \
    "https://${host}/${zone}/backups/${environment}/postgres/${remote}" \
    >/dev/null
  if [ -f "${work}/sealed" ]; then
    curl -fsS -X PUT -H "AccessKey: ${key}" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@${work}/sealed" \
      "https://${host}/${zone}/backups/${environment}/postgres/${stamp}.key.enc" \
      >/dev/null
    rm -f "${work}/sealed"
  fi
  echo "uploaded ${database} (${size} bytes) as ${remote}"
  rm -f "${file}"

  # Watchdog С7 reads this (relay/node/src/lib/backup_watch.ts): the time of the
  # last dump that went up, in the WORKING zone and with the node's own key —
  # the backup zone's key stays off the node, which is the point of that zone
  # (loop, 2026-09-24). A marker that fails to go up does not fail the backup;
  # the watchdog reads an old marker as a missed night, which errs loud.
  printf '{"at":"%s","dump":"%s","bytes":%s}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${remote}" "${size}" |
    curl -fsS -X PUT -H "AccessKey: ${marker_key}" -H "Content-Type: application/json" \
      --data-binary @- \
      "https://${marker_host}/${marker_zone}/backups/${environment}/last-ok.json" \
      >/dev/null || echo "WARNING: the backup marker for ${environment} did not go up" >&2

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
    # Every kind of object a night leaves behind, by the date its name starts
    # with. Until 2026-09-21 this matched ".sql.gz" alone, so from the first
    # encrypted night neither "<stamp>.sql.gz.enc" nor "<stamp>.key.enc" was
    # ever removed — the fourteen days became for ever, key shares and Art. 16
    # emails included (review panel, second pass).
    if name.endswith((".sql.gz", ".sql.gz.enc", ".key.enc")) and name[:10] < cutoff:
        print(name)
PY
    curl -fsS -X DELETE -H "AccessKey: ${key}" \
      "https://${host}/${zone}/backups/${environment}/postgres/${old}" >/dev/null &&
      echo "  removed ${old} (older than ${keep_days} days)"
  done
done
