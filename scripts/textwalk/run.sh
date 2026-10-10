#!/usr/bin/env bash
# A person's walk of the local stand, written down as text (docs/design/kit_RU.md §5):
# headless Chromium in a container, no screenshots. Stand first: scripts/up-local.sh <brand>.
#   scripts/textwalk/run.sh [http://localhost:4173] > walk.txt
set -euo pipefail
d="$(cd "$(dirname "$0")" && pwd)"
docker run --rm --network host -v "$d:/w:ro" -w /tmp mcr.microsoft.com/playwright:v1.48.2-jammy \
  sh -c "npm i --silent playwright@1.48.2 >/dev/null 2>&1 && cp /w/textwalk.mjs . && node textwalk.mjs ${1:-http://localhost:4173}"
