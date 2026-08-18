#!/usr/bin/env bash
# Render a design mockup from panel/design to a PNG.
#
#   scripts/render-design-mockup.sh kit-full
#   scripts/render-design-mockup.sh            # all of them
#
# The mockups used to live in panel/public, where the dev server resolved their
# `/fonts/…` for free — and where the production build picked them up and served
# them, which is why they moved out. This serves them the same way without
# putting them back in the build: panel/design at the root, `/fonts/` from the
# design's own faces first and the panel's second.
#
# Two rules that took a while to learn and are easy to lose:
#   * the viewport is the SVG's own size and the shot is NOT fullPage — otherwise
#     the page grows and the image gets a margin nobody asked for;
#   * `waitUntil: "load"`, not `domcontentloaded`: fonts are still arriving.
#
# Runs the Playwright image in Docker; nothing on the host.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="panel-tests-runner"
out="$root/testing/screenshots/design"

docker image inspect "$runner" >/dev/null 2>&1 || {
  echo "== образ $runner отсутствует, собираю"
  docker build -q -t "$runner" "$root/panel/tests" >/dev/null
}

mkdir -p "$out"

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e ONLY="${1:-}" \
  -v "$root/scripts/render-design-mockup.mjs":/tests/render.mjs:ro \
  -v "$root/panel/design":/design:ro \
  -v "$root/panel/public/fonts":/panel-fonts:ro \
  -v "$out":/out \
  -w /tests \
  --entrypoint node \
  "$runner" \
  render.mjs

echo
echo "PNG в testing/screenshots/design/"
