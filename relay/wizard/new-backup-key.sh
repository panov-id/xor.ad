#!/usr/bin/env bash
# A key pair for the nightly dumps: the public half goes to the box, the private
# half never does.
#
# The Hetzner DPA accepted on 2026-09-21 marks encryption of backups at rest as
# the client's responsibility (TOM appendix, p. 20), and until that day the
# dumps went to object storage in the clear — the whole database, names, ages,
# vault key shares, the emails of Article 16 notifiers, the panel's audit log.
# A leaked storage key handed over all of it.
#
# **Why a key pair and not a passphrase.** A passphrase the box uses to encrypt
# is a passphrase the box can decrypt with, so anyone who takes the box takes
# the backups too — which is most of what a backup is for. With a public key
# the box can only write: reading the dumps needs the private half, and the
# private half lives wherever the owner keeps such things. That is the whole
# point, and it is also the part that is easy to undo by accident — do not put
# the private key in backup.env "for convenience".
#
#   bash relay/wizard/new-backup-key.sh
#
# Prints both halves once. The public one goes into backup.env on the box as
# BACKUP_PUBLIC_KEY; the private one goes into a password manager, and if it is
# lost every dump encrypted with its public half is lost with it.
set -euo pipefail

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# In a container, because nothing is installed on the host — and openssl rather
# than age for the same reason: the alpine image has it already, and a backup
# tool that needs a tool nobody has on the night it matters is not a tool.
docker run --rm -v "$work":/out alpine:3.20 sh -c '
  apk add --no-cache openssl >/dev/null 2>&1
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out /out/private.pem 2>/dev/null
  openssl pkey -in /out/private.pem -pubout -out /out/public.pem
  chmod 600 /out/private.pem
'

echo "=== ПРИВАТНАЯ ПОЛОВИНА — в хранилище паролей, НЕ на узел ==="
echo "Без неё ни один зашифрованный дамп не открыть. С ней на узле шифрование"
echo "не защищает ни от чего: кто взял узел, тот взял и копии."
echo
cat "$work/private.pem"
echo
echo "=== ОТКРЫТАЯ ПОЛОВИНА — одной строкой в backup.env на боксе ==="
echo "BACKUP_PUBLIC_KEY=$(base64 -w0 < "$work/public.pem")"
echo
echo "Проверить расшифровку потом:"
echo "  openssl pkeyutl -decrypt -inkey private.pem -in <stamp>.key.enc \\"
echo "    -pkeyopt rsa_padding_mode:oaep -out datakey.txt"
echo "  openssl enc -d -aes-256-cbc -K \$(sed -n 1p datakey.txt) -iv \$(sed -n 2p datakey.txt) \\"
echo "    -in <stamp>.sql.gz.enc | gunzip > dump.sql"
