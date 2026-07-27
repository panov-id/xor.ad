#!/usr/bin/env bash
# Run the tenant migration against a real environment's Bunny storage, from
# inside the Deno image so nothing is installed on the host.
#
#   scripts/migrate-tenants-remote.sh dev                # plan only
#   scripts/migrate-tenants-remote.sh dev --apply        # copy into tenants/<brand>/
#   scripts/migrate-tenants-remote.sh dev --delete       # drop the verified originals
#
# The environment name is the relay's own (dev | staging | prod), which is what
# the storage keys are prefixed with. Credentials come from wizard/secrets.env —
# the same file the wizard hands to the nodes.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
secrets="$root/relay/wizard/secrets.env"

environment="${1:?usage: migrate-tenants-remote.sh <dev|staging|prod> [--apply|--delete]}"
shift || true

case "$environment" in
  dev|staging|prod) ;;
  *) echo "unknown environment '$environment' (expected dev, staging or prod)" >&2; exit 1 ;;
esac
# prod is a separate decision, not a typo away from the others.
if [ "$environment" = "prod" ] && [ "${CONFIRM_PROD:-}" != "yes" ]; then
  echo "refusing to touch prod without CONFIRM_PROD=yes" >&2
  exit 1
fi
[ -f "$secrets" ] || { echo "missing $secrets" >&2; exit 1; }

value_of() { grep -E "^$1=" "$secrets" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  -e STORAGE_TRANSPORT=bunny \
  -e NODE_ENV_NAME="$environment" \
  -e BUNNY_STORAGE_ZONE="$(value_of BUNNY_STORAGE_ZONE)" \
  -e BUNNY_STORAGE_KEY="$(value_of BUNNY_STORAGE_KEY)" \
  -e BUNNY_STORAGE_HOST="$(value_of BUNNY_STORAGE_HOST)" \
  "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write tools/migrate_tenants.ts "$@"
