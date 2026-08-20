#!/usr/bin/env bash
# Which WebCrypto algorithms real browser engines can actually do.
#
#   scripts/check-webcrypto-support.sh
#
# Written for one decision and kept for its successor: chat_RU.md §8.2 chose
# ECDSA P-256 over Ed25519 on 2026-08-19 because Chromium 136 and older cannot do
# Ed25519 at all, and somebody on such a device could not sign a single request.
# When that tail has died out the question comes back, and it should come back to
# a measurement rather than to a memory.
#
# Every operation is run, not looked up: generate, sign, verify, export, import,
# wrapKey — the last one because without it the long-term identity key cannot
# survive a device move (§8.13), so partial support would be no use.
#
# A fresh Playwright is installed inside the container on purpose. The pinned
# panel-tests image carries browsers from late 2024, and judging today's support
# by them is how a stale answer gets a confident tone.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -v "$root/testing/webcrypto-support.mjs":/work/probe.mjs:ro \
  -w /work \
  --entrypoint bash \
  mcr.microsoft.com/playwright:v1.49.0-noble \
  -c '
    npm init -y >/dev/null 2>&1
    npm install --silent playwright@latest >/dev/null 2>&1
    echo "== playwright $(node -e "console.log(require(\"playwright/package.json\").version)")"
    npx playwright install --with-deps chromium firefox webkit >/dev/null 2>&1
    node probe.mjs
  '
