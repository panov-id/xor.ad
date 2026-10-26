#!/usr/bin/env bash
# Ten people on the local stand (scripts/flow/crowd.mjs): Playwright Chromium from panel-tests-runner:latest on the host
# network, at the stand's app (xor-local-app :5174 -> the local sosed node). Writes into OUT (default: a new folder
# flow-<time> under the session scratchpad given as SCRATCH, else /tmp/claude-1000/flow): journal.jsonl, shots/, video/,
# summary.txt. Exit 0 every step ok and no town saw another's phrases, 1 not, 2 no stand.
#
#   scripts/flow/crowd.sh
#   SLOW=1 scripts/flow/crowd.sh          ~2 s between steps, to watch from your own browser
#   PEOPLE=4 scripts/flow/crowd.sh        fewer people
#   PANEL_ONLY=1 scripts/flow/crowd.sh    the panel walk alone (panel-summary.txt)
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app="${APP_URL:-http://127.0.0.1:5174}"
curl -sf -o /dev/null "$app/" || { echo "crowd: NO STAND — $app does not answer (scripts/up-app.sh)"; exit 2; }
out="${OUT:-${SCRATCH:-/tmp/claude-1000/flow}/flow-$(date +%m%d-%H%M%S)}"
mkdir -p "$out"; chmod 777 "$out"
echo "crowd: writing to $out"
if [ "${PANEL_ONLY:-0}" = 1 ] && [ "${PANEL:-1}" != 1 ]; then echo "crowd: PANEL_ONLY=1 with PANEL=0 walks nothing"; exit 2; fi
rc=0
if [ "${PANEL_ONLY:-0}" != 1 ]; then
  # In the app container's own network namespace, not the host's: the host's Wi-Fi and docker bridges come and go, and
  # Chromium drops a page's modules on every such change (net::ERR_NETWORK_CHANGED, a blank screen). There the app is
  # the same localhost:5174 and nothing else moves.
  docker run --rm --network "container:${APP_CONTAINER:-xor-local-app}" -u "$(id -u):$(id -g)" -e HOME=/tmp -e APP_URL="$app" -e OUT=/out \
    -e SLOW="${SLOW:-0}" -e PEOPLE="${PEOPLE:-10}" \
    -v "$out":/out -v "$root/scripts/flow/crowd.mjs":/tests/crowd.mjs:ro -w /tests --entrypoint node panel-tests-runner:latest /tests/crowd.mjs
  rc=$?
  echo "crowd: $out/summary.txt"
fi
# The panel after the crowd: the stand's own panel service (docker-compose.web.yml, built from panel/), started alone
# (--no-deps: the node and the rest stay as they run), walked from a browser inside the stand's network, where the panel
# is http://panel:5173 and its node http://node:8080. PANEL=0 skips it; PANEL_ONLY=1 walks only the panel.
if [ "${PANEL:-1}" = 1 ]; then
  project="${STAND:-xor-local-sosed}"
  docker compose -p "$project" -f "$root/docker-compose.web.yml" up -d --no-deps --wait --wait-timeout 300 panel >/dev/null \
    || { echo "crowd: the panel did not come up (docker compose -p $project logs panel)"; exit 1; }
  docker run --rm --network "${project}_default" -u "$(id -u):$(id -g)" -e HOME=/tmp -e OUT=/out -e PANEL_URL=http://panel:5173 \
    -v "$out":/out -v "$root/scripts/flow/crowd.mjs":/tests/crowd.mjs:ro -w /tests --entrypoint node panel-tests-runner:latest /tests/crowd.mjs
  prc=$?
  echo "crowd: $out/panel-summary.txt"
  [ $prc -ne 0 ] && rc=1
fi
exit $rc
