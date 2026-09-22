#!/usr/bin/env bash
# The terminal face's screens: rendered, typed into, asserted. No node needed —
# the protocol's own tests live in scripts/run-depth-tests.sh.
#
# Node runs straight from the sources (type stripping), inside Docker like
# everything else here; nothing is installed on the host.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="node:24-alpine"
[ -d "$root/depth/node_modules" ] || docker run --rm -v "$root/depth":/d -w /d "$image" npm install --no-audit --no-fund >/dev/null
docker run --rm -v "$root":/repo -w /repo/depth "$image" \
  node --experimental-transform-types ink/screens.node-test.ts
