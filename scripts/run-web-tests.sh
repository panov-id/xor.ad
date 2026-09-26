#!/usr/bin/env bash
# The web face end to end: a throwaway node and the built page in containers,
# Playwright at it (docker-compose.web.yml). Exit code is the tests'.
#
#   scripts/run-web-tests.sh            # up, test, down
#   scripts/run-web-tests.sh --keep     # leave the stand up (page at :4173)
#
# The project name carries this run's PID, so two runs in two worktrees do not
# share containers or a database.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="web-e2e-$$"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$root/web/e2e/results"

keep=0
[ "${1:-}" = "--keep" ] && keep=1
cleanup() {
  if [ "$keep" -eq 1 ]; then echo "stand kept: ${compose[*]} down -v"; return; fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "== build and run: postgres, migrations, seed, node, web, e2e"
"${compose[@]}" up --build --abort-on-container-exit --exit-code-from e2e e2e
status=$?
if [ "$status" -ne 0 ]; then
  for service in migrate seed node web; do
    echo "── $service log (tail) ──" >&2; "${compose[@]}" logs --no-color --tail 40 "$service" >&2
  done
fi
exit "$status"
