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
  -v "$root/app/src":/repo/app/src:ro -v "$root/app/tokens":/repo/app/tokens:ro -v "$root/web/src/locales":/repo/web/src/locales:ro -v "$root/depth/ink/locales":/repo/depth/ink/locales:ro -v "$root/depth/core":/repo/depth/core:ro -v "$root/depth/web-platform":/repo/depth/web-platform:ro -v "$root/docs/newdesign/proto":/repo/docs/newdesign/proto:ro \
  -w /repo --user "$(id -u):$(id -g)" node:24-alpine \
  node --experimental-strip-types --no-warnings --test "${tests[@]}"
# The design stand's own tests (scripts/design/*.test.ts: the node stub's crypto against depth/core), in the runner image
# that has playwright, as the stand imports it; the same mounts the stand's run uses.
mapfile -t stand < <(cd "$root" && find scripts/design -maxdepth 1 -name '*.test.ts' -printf '%f\n' | sort)
[ "${#stand[@]}" -eq 0 ] || docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$root/depth/core":/depth/core:ro -v "$root/scripts/design":/tests/sd:ro -w /tests/sd --entrypoint node panel-tests-runner:latest \
  --experimental-transform-types --no-warnings --test "${stand[@]}"
# The crowd's plan against the app it walks (scripts/flow/crowd-plan.test.mjs): it reads app/, depth/core and the crowd, and
# went red for three days unseen while nothing ran it (review panel 30.10.2026). The same runner image the crowd uses.
docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$root":/r:ro -w /r --entrypoint node panel-tests-runner:latest \
  --test scripts/flow/crowd-plan.test.mjs
# The newdesign4 generators' own tests that need only the standard library: the inventory (283 screens of the kit) and
# the theme tokens. nd4-compare (Pillow) and nd4-fonts (fontTools) need packages this image lacks and are not run here.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$root":/r:ro -w /r python:3.13-alpine \
  sh -c 'python3 -I scripts/nd4-inventory.test.py && python3 -I scripts/design/nd4-tokens.test.py && python3 -I scripts/geo/build-villages.test.py && python3 -I scripts/design/nd4-extract.test.py && python3 -I scripts/design/nd4-map.test.py'
