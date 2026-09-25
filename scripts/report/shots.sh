#!/usr/bin/env bash
# Take live screenshots of the public faces into $REPORT_WORK/shots, with
# Playwright from the panel-tests-runner image.
set -euo pipefail
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
mkdir -p "$W/shots"
timeout 300 docker run --rm -v "$H/shots.mjs":/tests/shots.mjs:ro -v "$W/shots":/out -w /tests \
  --entrypoint node panel-tests-runner:latest shots.mjs
