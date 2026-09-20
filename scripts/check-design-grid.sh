#!/usr/bin/env bash
# The character grid of the terminal sheets — captions under buttons and the inset of a button in its block.
#
#   scripts/check-design-spacing.sh                # all screen-*.svg
#   scripts/check-design-spacing.sh screen-03      # one sheet
#   DESIGN_DIR=/some/dir scripts/check-design-spacing.sh   # another set (the probe)
#
# Runs scripts/check-design-grid.mjs in the Playwright image; nothing on the host.
# Exit codes: 0 — clean; 1 — a caption off centre or a button too close to its block edge;
# 3 — no sheets to measure.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
design="${DESIGN_DIR:-$root/panel/design}"
runner="panel-tests-runner"
docker image inspect "$runner" >/dev/null 2>&1 || docker build -q -t "$runner" "$root/panel/tests" >/dev/null
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e ONLY="${1:-}" \
  -v "$root/scripts/check-design-grid.mjs":/tests/check.mjs:ro \
  -v "$design":/design:ro \
  -v "$root/panel/design/fonts":/design-fonts:ro \
  -v "$root/panel/public/fonts":/panel-fonts:ro \
  -w /tests \
  --entrypoint node \
  "$runner" \
  check.mjs
