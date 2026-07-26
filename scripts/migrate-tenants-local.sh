#!/usr/bin/env bash
# Run the tenant migration against the local stand (fs storage in
# relay/local/data), inside the Deno image so nothing lands on the host.
#
#   scripts/migrate-tenants-local.sh              # plan only
#   scripts/migrate-tenants-local.sh --apply      # copy into tenants/<brand>/
#   scripts/migrate-tenants-local.sh --delete     # drop the verified originals
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$root/relay/node":/node \
  -v "$root/relay/local/data":/data \
  -w /node \
  -e STORAGE_TRANSPORT=fs \
  -e STORAGE_DIR=/data \
  -e NODE_ENV_NAME=local \
  "$image" \
  deno run --allow-env --allow-read --allow-write tools/migrate_tenants.ts "$@"
