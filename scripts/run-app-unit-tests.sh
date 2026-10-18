#!/usr/bin/env bash
# The new shell's pure functions (app/src/**/*.test.ts) under node:test, in a container: nothing on
# the host. The dictionaries (web/src/locales, depth/ink/locales) are mounted read-only, as the
# shell reads them. The runner sits on UTC+14 as run-web-unit-tests.sh does.
#
#   scripts/run-app-unit-tests.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mapfile -t tests < <(cd "$root" && find app/src -name '*.test.ts' | sort)
[ "${#tests[@]}" -gt 0 ] || { echo "run-app-unit-tests: RED — no app/src/**/*.test.ts" >&2; exit 1; }
docker run --rm -e TZ=Pacific/Kiritimati \
  -v "$root/app/src":/repo/app/src:ro -v "$root/app/tokens":/repo/app/tokens:ro -v "$root/web/src/locales":/repo/web/src/locales:ro -v "$root/depth/ink/locales":/repo/depth/ink/locales:ro -v "$root/depth/core":/repo/depth/core:ro \
  -w /repo --user "$(id -u):$(id -g)" node:24-alpine \
  node --experimental-strip-types --no-warnings --test "${tests[@]}"
