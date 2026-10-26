#!/usr/bin/env bash
# Snapshots a screen of the running app shell (stand container xor-local-app) as SVG built from the DOM (scripts/design/snap-svg.mjs), with the Playwright
# image panel-tests-runner:latest on the stand's network; the node is stubbed in the browser, nothing is written to the stand's node. One run at a time.
#
#   scripts/snap-svg.sh <scene> <width>     e.g.  scripts/snap-svg.sh me 1920      scripts/snap-svg.sh blocked 1920
#   scripts/snap-svg.sh all                 every scene at 390, 834, 1440, 1920
# Scenes: splash restore register-1 register-2 register-3 feed card feed-table composer talks chat match likes tables table new-table me
#         me-name me-theme me-lang me-filter me-pin me-reissue me-away me-place me-legal me-statements me-hidden me-blocked me-reset departure
#         cabinet-sign-in cabinet-venues cabinet-offers   ("blocked" = "me-blocked"; several: comma-separated)
# Output: $SNAP_DIR/<scene>@<w>.svg; SNAP_DIR is required (the caller's own scratchpad, e.g. .../scratchpad/snap).   Exit 0 something snapped, 1 nothing, 2 no stand.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stand="${STAND:-xor-local-app}"
runner="panel-tests-runner:latest"
out="${SNAP_DIR:-}"
scene="${1:-}"; width="${2:-}"
[ -n "$out" ] || { echo "usage: SNAP_DIR=<your scratchpad>/snap scripts/snap-svg.sh <scene> <width> | all"; exit 64; }
[ -n "$scene" ] || { echo "usage: scripts/snap-svg.sh <scene> <width> | all"; exit 64; }
if [ "$scene" = "all" ]; then width="390,834,1440,1920"; fi
[ -n "$width" ] || { echo "usage: scripts/snap-svg.sh <scene> <width> | all"; exit 64; }
docker ps --format '{{.Names}}' | grep -qx "$stand" || { echo "snap-svg: SPOILED — container $stand is not up"; exit 2; }
mkdir -p "$out"
docker run --rm --network "container:$stand" -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$root/scripts/design/snap-svg.mjs":/tests/snap-svg.mjs:ro -v "$root/scripts/design/measure-app-overlap.mjs":/tests/measure-app-overlap.mjs:ro \
  -v "$out":/out -w /tests -e SCENES="$scene" -e WIDTHS="$width" -e OUT=/out --entrypoint node "$runner" snap-svg.mjs
rc=$?
echo "files in $out:"; ls -l "$out" | awk 'NR>1{print $5, $9}'
exit $rc
