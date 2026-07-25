#!/usr/bin/env bash
# Run the relay unit tests and type-check inside the same Deno image the node
# ships with, so nothing is installed on the host. Optional args are passed to
# `deno test` (e.g. --filter "access").
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"

docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  "$image" \
  deno check src/main.ts

docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  "$image" \
  deno test --allow-env "$@"
