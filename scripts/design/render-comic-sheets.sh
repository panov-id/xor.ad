#!/usr/bin/env bash
# Render the comic sheets (panel/design/sheets-comic/*.svg, built by scripts/design/comic-sheets.py) to PNG
# @2x, the reference check-web-design.sh compares the web's shots with since 02.10.2026. The same renderer
# as scripts/render-design-mockup.sh, with sheets-comic as its root and panel/design/fonts for /fonts/.
#
#   scripts/design/render-comic-sheets.sh <out dir>
#
# Playwright image in Docker; nothing on the host.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="${1:?out dir}"
mkdir -p "$out"
runner="panel-tests-runner"
docker image inspect "$runner" >/dev/null 2>&1 || docker build -q -t "$runner" "$root/panel/tests" >/dev/null
docker run --rm -u "$(id -u):$(id -g)" \
  -v "$root/scripts/render-design-mockup.mjs":/tests/render.mjs:ro \
  -v "$root/panel/design/sheets-comic":/design:ro \
  -v "$root/panel/design/fonts":/panel-fonts:ro \
  -v "$(cd "$out" && pwd)":/out \
  -w /tests --entrypoint node "$runner" render.mjs
