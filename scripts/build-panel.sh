#!/usr/bin/env bash
# Production build of the panel (tsc + refine/vite build) inside a Node
# container, using the already-installed node_modules. Nothing is installed
# on the host.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$root/panel":/panel \
  -w /panel \
  node:20-alpine \
  npm run build
