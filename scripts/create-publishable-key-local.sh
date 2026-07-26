#!/usr/bin/env bash
# Mint a publishable key against the local stand (fs storage in relay/local/data).
#
#   scripts/create-publishable-key-local.sh sosed http://localhost:8080
#   scripts/create-publishable-key-local.sh neighbro          # any origin
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$root/relay/node":/node \
  -v "$root/relay/local/data":/data \
  -w /node \
  -e STORAGE_TRANSPORT=fs \
  -e STORAGE_DIR=/data \
  -e NODE_ENV_NAME=local \
  denoland/deno:alpine-2.1.4 \
  deno run --allow-env --allow-read --allow-write tools/create_publishable_key.ts "$@"
