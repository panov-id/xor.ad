#!/usr/bin/env bash
# A person's walk of the local stand, written down as text (docs/design/kit_RU.md §5):
# headless Chromium in a container, no screenshots. Stand first: scripts/up-local.sh <brand>.
#   scripts/textwalk/run.sh [http://localhost:4173] > walk.txt
#   WALK_STABLE=1 ...   no timings and a fixed label, so two walks diff line by line
# The runner image (playwright baked in) is built once; the walk itself needs no registry.
set -euo pipefail
d="$(cd "$(dirname "$0")" && pwd)"
img=xor-textwalk:1.48.2
docker image inspect "$img" >/dev/null 2>&1 || docker build -q -t "$img" "$d" >/dev/null
shots=()
# WALK_SHOTS=<host dir>: a picture of every step lands there (only with the owner's yes for the task).
if [ -n "${WALK_SHOTS:-}" ]; then mkdir -p "$WALK_SHOTS"; shots=(-e WALK_SHOTS=1 -u "$(id -u):$(id -g)" -v "$WALK_SHOTS:/shots"); fi
docker run --rm --network host -e WALK_STABLE="${WALK_STABLE:-}" -e WALK_WIDTH="${WALK_WIDTH:-}" "${shots[@]}" -v "$d/textwalk.mjs:/walk/textwalk.mjs:ro" "$img" \
  node /walk/textwalk.mjs "${1:-http://localhost:4173}"
