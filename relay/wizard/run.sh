#!/usr/bin/env bash
# Build + run the wizard launchpad in Docker (no host installs). Mounts the whole
# relay dir (wizard needs node/ + compose/ to upload; inventory + secrets
# stay local) and your SSH agent for provisioning/configuring.
# Usage: ./run.sh status | ./run.sh up --node dev | ./run.sh configure --node n3
# Secrets (BUNNY_STORAGE_*, RESEND_API_KEY, provider tokens): put in secrets.env
# and export SECRETS_ENV=wizard/secrets.env, or pass -e on the host beforehand.
set -euo pipefail
cd "$(dirname "$0")"                       # wizard/
ROOT="$(cd .. && pwd)"                      # relay/

docker build -q -t relay-wizard . >/dev/null
docker run --rm -it \
  -v "$ROOT:/relay" -w /relay/wizard \
  -v "${SSH_AUTH_SOCK:-/dev/null}:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent \
  --env-file "${SECRETS_ENV:-/dev/null}" \
  relay-wizard "$@"
