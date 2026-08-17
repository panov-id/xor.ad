#!/usr/bin/env bash
# Run panel/tests/check-font-weights.mjs in the Playwright image — nothing on
# the host. CI runs the same file directly (see .github/workflows/panel.yml);
# this is the local door to it.
#
# What it guards and why is written at the top of the .mjs.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="panel-tests-runner"

docker image inspect "$runner" >/dev/null 2>&1 || {
  echo "== образ $runner отсутствует, собираю"
  docker build -q -t "$runner" "$root/panel/tests" >/dev/null
}

# The image keeps its node_modules in /tests, so the script runs from there and
# reads the panel through a separate read-only mount.
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e PANEL_DIR=/panel \
  -v "$root/panel/tests/check-font-weights.mjs":/tests/check-font-weights.mjs:ro \
  -v "$root/panel":/panel:ro \
  -w /tests \
  --entrypoint node \
  "$runner" \
  check-font-weights.mjs
