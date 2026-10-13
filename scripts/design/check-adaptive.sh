#!/usr/bin/env bash
# The stand against the adaptive sheets (check-adaptive.mjs), both brands, no screenshots.
# Stands first: scripts/up-local.sh sosed && scripts/up-local.sh neighbro.
#   scripts/design/check-adaptive.sh [screen…]
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
img=xor-textwalk:1.48.2
docker image inspect "$img" >/dev/null 2>&1 || docker build -q -t "$img" "$root/scripts/textwalk" >/dev/null
rc=0
for pair in sosed:4173 neighbro:4183; do
  docker run --rm --network host -v "$root/scripts/design/check-adaptive.mjs:/walk/check.mjs:ro" \
    -v "$root/panel/design:/design:ro" "$img" node /walk/check.mjs "http://localhost:${pair#*:}" "${pair%%:*}" "$@" || rc=1
done
exit $rc
