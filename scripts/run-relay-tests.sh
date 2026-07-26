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
  sh -c 'deno check $(find src tools -name "*.ts")'

docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  "$image" \
  deno test --allow-env --allow-read --allow-write --ignore=test/tenancy.test.ts "$@"

# The tenancy test rewrites BRANDS/SESSION_SECRET for the whole process (config
# is captured at import), so it runs in one of its own rather than leaking into
# everyone else's configuration.
docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  "$image" \
  deno test --allow-env --allow-read --allow-write test/tenancy.test.ts
