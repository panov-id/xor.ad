#!/usr/bin/env bash
# Type-check the panel (no emit) inside a Node container, so nothing is
# installed on the host. Uses the panel's already-installed node_modules.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -v "$root/panel":/panel \
  -w /panel \
  node:20-alpine \
  npx tsc --noEmit
