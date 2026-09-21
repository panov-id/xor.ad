#!/usr/bin/env bash
# Tests of the depth client's core, in the same Deno image the node uses.
# The core is checked against the node's own verifier, so the repo is mounted
# whole and the tests import across the two.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker run --rm -v "$root":/repo -w /repo "denoland/deno:alpine-2.1.4" \
  deno test --allow-env --allow-read depth/ "$@"
