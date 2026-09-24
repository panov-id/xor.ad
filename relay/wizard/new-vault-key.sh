#!/usr/bin/env bash
# Print a new VAULT_SHARE_KEY. Run it once per environment, keep the output.
#
#   relay/wizard/new-vault-key.sh
#
# Why a script rather than "think of something": until 2026-09-21 the node
# derived its sealing key with a single SHA-256 over whatever this variable
# held, and nothing anywhere said what it should hold. A memorable phrase there
# meant a dump of `vault_shares` could be searched offline at one hash per
# guess. The derivation is HKDF now (relay/node/src/lib/vault_share.ts), which
# fixes the domain separation and not the entropy — entropy is this file's job.
#
# 32 bytes from the system CSPRNG, printed base64. Nothing is written anywhere:
# where the value is kept is the operator's decision, and a script that helpfully
# appended it to a file would be a script that quietly made a second copy.
#
# **Losing this value loses every local history in that environment**, and
# changing it does the same — the shares sealed under the old one stop opening.
# It wants the handling of a backup key, not of a password. When it has to
# change anyway — only on a leak — the order and the price are in
# docs/deployment_EN.md, "The vault key VAULT_SHARE_KEY: changed only at a loss".
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is not on PATH — install it, or use: head -c 32 /dev/urandom | base64" >&2
  exit 1
fi

key="$(openssl rand -base64 32)"
cat <<TEXT
$key

Put it in the wizard's secrets.env as the line for the environment you are
deploying, for example:

  VAULT_SHARE_KEY_DEV=$key

Keep it where you keep POSTGRES_PASSWORD. It is not rotatable: every share
sealed under the old value stops opening.
TEXT
