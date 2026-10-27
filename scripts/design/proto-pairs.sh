#!/usr/bin/env bash
# Shot pairs, prototype next to the app (scripts/design/proto-pairs.mjs), in the Playwright image, no network.
#
#   scripts/design/proto-pairs.sh <app-shots-dir> <out-dir>     exit 0 all 148 paired, 1 some missing
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app="$(cd "$1" && pwd)"; mkdir -p "$2"; out="$(cd "$2" && pwd)"
docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$root/docs/newdesign/proto":/proto:ro -v "$app":/app:ro -v "$out":/out \
  -v "$root/scripts/design/proto-pairs.mjs":/tests/proto-pairs.mjs:ro -w /tests --entrypoint node panel-tests-runner:latest /tests/proto-pairs.mjs
