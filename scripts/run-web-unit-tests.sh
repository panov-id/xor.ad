#!/usr/bin/env bash
# The web face's pure functions (web/src/**/*.test.ts) under node:test, in a
# container: nothing on the host. The runner sits on UTC+14 so that a test
# leaning on the device's clock instead of the place's goes red.
#
#   scripts/run-web-unit-tests.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mapfile -t tests < <(cd "$root" && find web/src -name '*.test.ts' | sort)
[ "${#tests[@]}" -gt 0 ] || { echo "run-web-unit-tests: RED — no web/src/**/*.test.ts" >&2; exit 1; }
docker run --rm -e TZ=Pacific/Kiritimati -v "$root/web/src":/repo/web/src:ro -w /repo \
  --user "$(id -u):$(id -g)" node:24-alpine \
  node --experimental-strip-types --no-warnings --test "${tests[@]}"
