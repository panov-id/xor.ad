#!/usr/bin/env bash
# E1: the two people's whole path in a browser against a live node — the
# web stand of docker-compose.web.yml (node, every migration, seed, the page)
# and one spec, web/e2e/specs/<spec>.spec.ts (two-people by default). Each
# person's video lands in web/e2e/results/<spec>/*.webm. Exit code is the spec's.
#
#   scripts/run-web-two-people.sh [spec name, default two-people]
#
# The project name carries this run's PID, so two runs do not share a stand.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="web-two-$$"
spec="${1:-two-people}"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$root/web/e2e/results"
# What runs a day old left behind: nothing reads it, and it is never committed.
find "$root/web/e2e/results" -mindepth 1 -maxdepth 1 \( -name 'run-*' -o -name 'mixed-sync-*' -o -name 'mixed-depth-*.log' \) \
  -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
rm -rf "$root/web/e2e/results/$spec"
cleanup() { "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
# A signal ends the run: cleanup alone would let the script go on and bring
# containers back up with nobody left to take them down.
trap 'exit 130' INT; trap 'exit 143' TERM; trap 'exit 129' HUP
echo "== build and start: postgres, migrations, seed, node, web (and the panel if the spec needs it)"
# A spec that walks into the moderator's panel (it reads PANEL_URL) gets the
# panel too; the others do not pay for its build.
services=(web web-adv)
grep -q PANEL_URL "$root/web/e2e/specs/$spec.spec.ts" 2>/dev/null && services+=(panel)
"${compose[@]}" build e2e web web-adv node >/dev/null || exit 1
"${compose[@]}" up -d --wait "${services[@]}" || exit 1
echo "== $spec"
"${compose[@]}" run --rm e2e npx playwright test "specs/$spec.spec.ts"
status=$?
if [ "$status" -ne 0 ]; then
  for service in node web; do
    echo "── $service log (tail) ──" >&2; "${compose[@]}" logs --no-color --tail 40 "$service" >&2
  done
fi
echo "== videos"
find "$root/web/e2e/results/$spec" -name '*.webm' -printf '%s bytes  %p\n' 2>/dev/null || echo "no videos"
exit "$status"
