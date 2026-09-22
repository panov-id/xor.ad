#!/usr/bin/env bash
# The terminal face's screens: rendered, typed into, asserted. No node needed —
# the protocol's own tests live in scripts/run-depth-tests.sh.
#
# Node runs straight from the sources (type stripping), inside Docker like
# everything else here; nothing is installed on the host.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="node:24.21.0-alpine"  # точная версия: минор, ездящий между прогонами, — это тест, который никто не менял
# Dependencies live in a Docker volume, installed from the lockfile every run:
# a directory in the working tree was written by the container's root and was
# reused even after package.json moved (operations lens, 2026-09-22).
mods="-v depth-node-modules:/repo/depth/node_modules"
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth "$image" \
  npm ci --no-audit --no-fund >/dev/null
# Крышка времени: зависший рендер иначе вешает и эти ворота, и check-all.
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth "$image" \
  node --experimental-transform-types ink/screens.node-test.ts
