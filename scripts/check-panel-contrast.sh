#!/usr/bin/env bash
# Contrast of the panel's colour tokens, both themes, by arithmetic. Runs in the
# same Node image as the rest of the panel tooling — nothing on the host.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The one counter, the same file CI runs. panel/tests/contrast.mjs was a second
# copy with eight pairs and two theme blocks; it is gone.
docker run --rm -v "$root/panel":/panel -w /panel node:22-alpine node check-contrast.mjs
