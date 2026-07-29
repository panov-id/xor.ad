#!/usr/bin/env bash
# Panel unit tests (vitest) in Docker — nothing installed on the host.
#
# The e2e suite needs a browser, the panel dev server and the relay stand, and
# takes a minute. These need none of that: they cover the logic a component
# calls, which is most of what breaks. Run them first; run the e2e when the
# question is whether the pages still work.
#
# The whole repository is mounted, not just panel/: one test reads the relay's
# permission catalogue to prove the panel's copy has not drifted from it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -v "$root":/repo -w /repo/panel \
  -u "$(id -u):$(id -g)" -e HOME=/tmp \
  node:22-bookworm npm test "$@"
