#!/usr/bin/env bash
# E1: the two people's whole path in a browser against a live node — the
# web stand of docker-compose.web.yml (node, every migration, seed, the page)
# and only web/e2e/specs/two-people.spec.ts. Each person's video lands in
# web/e2e/results/two-people/*.webm. Exit code is the spec's.
#
#   scripts/run-web-two-people.sh
#
# The project name carries this run's PID, so two runs do not share a stand.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="web-two-$$"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$root/web/e2e/results"
rm -rf "$root/web/e2e/results/two-people"
cleanup() { "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
echo "== build and start: postgres, migrations, seed, node, web"
"${compose[@]}" build e2e web web-adv node >/dev/null || exit 1
"${compose[@]}" up -d --wait web web-adv || exit 1
echo "== two people"
"${compose[@]}" run --rm e2e npx playwright test specs/two-people.spec.ts
status=$?
if [ "$status" -ne 0 ]; then
  for service in node web; do
    echo "── $service log (tail) ──" >&2; "${compose[@]}" logs --no-color --tail 40 "$service" >&2
  done
fi
echo "== videos"
find "$root/web/e2e/results/two-people" -name '*.webm' -printf '%s bytes  %p\n' 2>/dev/null || echo "no videos"
exit "$status"
