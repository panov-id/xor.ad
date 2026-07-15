#!/usr/bin/env bash
# Build + run the wizard launchpad in Docker (no host installs). Mounts the
# wizard dir (inventory + secrets stay local) and your SSH agent for provisioning.
# Usage: ./run.sh status   |   ./run.sh up --node dev   |   ./run.sh configure
set -euo pipefail
cd "$(dirname "$0")"

docker build -q -t edge-nodes-wizard . >/dev/null
docker run --rm -it \
  -v "$PWD:/wizard" \
  -v "${SSH_AUTH_SOCK:-/dev/null}:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent \
  --env-file "${SECRETS_ENV:-/dev/null}" \
  edge-nodes-wizard "$@"
