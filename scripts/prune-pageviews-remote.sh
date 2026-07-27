#!/usr/bin/env bash
# Prune old page views in a real environment's storage, from inside the Deno
# image so nothing lands on the host.
#
#   scripts/prune-pageviews-remote.sh dev                    # plan, 90 days
#   scripts/prune-pageviews-remote.sh dev --days=30          # plan, 30 days
#   scripts/prune-pageviews-remote.sh dev --apply            # delete
#   CONFIRM_PROD=yes scripts/prune-pageviews-remote.sh prod --apply
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
secrets="$root/relay/wizard/secrets.env"

environment="${1:?usage: prune-pageviews-remote.sh <dev|staging|prod> [--days=N] [--apply]}"
shift || true

case "$environment" in
  dev|staging|prod) ;;
  *) echo "unknown environment '$environment'" >&2; exit 1 ;;
esac
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
  deno run --allow-env --allow-net --allow-read --allow-write tools/prune_pageviews.ts "$@"
