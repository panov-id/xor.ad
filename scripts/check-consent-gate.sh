#!/usr/bin/env bash
# Nothing may reach a Google domain before the visitor consents — checked on the
# live storefronts, because that is the only place the analytics id is set.
#
# Run it after a production deploy of either storefront:
#   scripts/check-consent-gate.sh
#
# The run also drives the accept button and fails if the requests do NOT appear
# afterwards. Without that half, "zero requests to Google" would also be true of
# a page that failed to load, a site with no analytics id, or a probe watching
# the wrong thing — and it would stay green through all three.
#
# Runs the Playwright image in Docker; nothing on the host.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="panel-tests-runner"

docker image inspect "$runner" >/dev/null 2>&1 || {
  echo "== образ $runner отсутствует, собираю"
  docker build -q -t "$runner" "$root/panel/tests" >/dev/null
}

# The script runs from /tests, where the image keeps its node_modules.
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$root/testing/consent-gate.mjs":/tests/consent-gate.mjs:ro \
  -w /tests \
  --entrypoint node \
  "$runner" \
  consent-gate.mjs
