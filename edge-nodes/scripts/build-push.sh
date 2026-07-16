#!/usr/bin/env bash
# Build + push the node and caddy images to ghcr (alternative to CI). Boxes then
# `docker compose pull` them. Needs a GitHub token with packages:write.
#   GITHUB_TOKEN=<token> GHCR_USER=<you> ./build-push.sh [tag]
# The token is in xor.ad/deploy/.env.deploy. Make the packages PUBLIC once in the
# GitHub package settings so boxes can pull without logging in.
set -euo pipefail
REG="ghcr.io/panov-id"
TAG="${1:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

: "${GITHUB_TOKEN:?set GITHUB_TOKEN}"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-panov-id}" --password-stdin

for name in node caddy; do
  img="$REG/edge-$name:$TAG"
  echo "=== build+push $img ==="
  docker build -t "$img" "$ROOT/$name"
  docker push "$img"
done
echo "done. Ensure the ghcr packages edge-node/edge-caddy are PUBLIC."
