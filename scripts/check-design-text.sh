#!/usr/bin/env bash
# Text on the mock-up sheets against the phone frame — measured in a browser.
#
#   scripts/check-design-text.sh                # all screen-*.svg
#   scripts/check-design-text.sh screen-03      # one sheet
#   DESIGN_DIR=/some/dir scripts/check-design-text.sh   # another set (the probe)
#
# Runs scripts/check-design-text.mjs in the Playwright image; nothing on the host.
# Exit codes: 0 — clean; 1 — a line leaves its frame or lies on another;
# 3 — no sheets to measure.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
design="${DESIGN_DIR:-$root/panel/design}"
runner="panel-tests-runner"
docker image inspect "$runner" >/dev/null 2>&1 || docker build -q -t "$runner" "$root/panel/tests" >/dev/null
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e ONLY="${1:-}" \
  -v "$root/scripts/check-design-text.mjs":/tests/check.mjs:ro \
  -v "$design":/design:ro \
  -v "$root/panel/design/fonts":/design-fonts:ro \
  -v "$root/panel/public/fonts":/panel-fonts:ro \
  -w /tests \
  --entrypoint node \
  "$runner" \
  check.mjs
