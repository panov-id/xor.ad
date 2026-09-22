#!/usr/bin/env bash
# The terminal face's screens: rendered, typed into, asserted. No node needed —
# the protocol's own tests live in scripts/run-depth-tests.sh.
#
# Node runs straight from the sources (type stripping), inside Docker like
# everything else here; nothing is installed on the host.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="node:24.21.0-alpine"  # точная версия: минор, ездящий между прогонами, — это тест, который никто не менял
# Dependencies live in a Docker volume named after the lockfile, and are
# installed once per lockfile: `npm ci` wipes node_modules, so two runs sharing
# one volume tore each other's tree apart — measured 22.09.2026, both runs died
# with ENOTEMPTY. A marker inside the volume says the tree matches this lock.
lock_hash="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
mods="-v depth-node-modules-$lock_hash:/repo/depth/node_modules"
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth "$image" \
  sh -c '[ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund && touch node_modules/.lock-ok; }' >/dev/null
# Крышка времени: зависший рендер иначе вешает и эти ворота, и check-all.
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth "$image" \
  node --experimental-transform-types ink/screens.node-test.ts
