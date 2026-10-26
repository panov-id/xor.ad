#!/usr/bin/env bash
# Measures the running app shell (the stand http://localhost:5174, container xor-local-app) for OVERLAPS (every reachable screen at 390/834/1440/1920,
# scripts/design/measure-app-overlap.mjs) and for MOTION (four scenes with prefers-reduced-motion: no-preference, scripts/design/measure-app-motion.mjs),
# with the Playwright image panel-tests-runner:latest on the stand container's network. The node is stubbed in the browser: nothing is written to the stand's node.
# Results: /tmp/claude-1000/measure-app/measure-overlap.txt, /tmp/claude-1000/measure-app/measure-motion.txt (only that folder is mounted).  Exit 0 both ran and the overlap break test went red then green, 1 not, 2 no stand.
#
#   ONLY=overlap|motion scripts/measure-app-overlap.sh      one of the two
#   WIDTHS=390,1440 scripts/measure-app-overlap.sh          fewer widths (overlap)
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stand="${STAND:-xor-local-app}"
res=/tmp/claude-1000/measure-app   # its own folder: the container writes nowhere else (not the sessions' scratchpads)
runner="panel-tests-runner:latest"
docker ps --format '{{.Names}}' | grep -qx "$stand" || { echo "measure-app-overlap: SPOILED — container $stand is not up"; exit 2; }
mkdir -p "$res"
run() {   # $1 script name (without .mjs)
  docker run --rm --network "container:$stand" -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$root/scripts/design/measure-app-overlap.mjs":/tests/measure-app-overlap.mjs:ro -v "$root/scripts/design/measure-app-motion.mjs":/tests/measure-app-motion.mjs:ro \
    -v "$res":/out -w /tests -e WIDTHS="${WIDTHS:-390,834,1440,1920}" --entrypoint node "$runner" "$1.mjs"
}
rc=0
if [ "${ONLY:-}" != "motion" ]; then echo "== overlap"; run measure-app-overlap | tail -n 60; [ "${PIPESTATUS[0]}" -eq 0 ] || rc=1; fi
if [ "${ONLY:-}" != "overlap" ]; then echo "== motion"; run measure-app-motion | tail -n 80; [ "${PIPESTATUS[0]}" -eq 0 ] || rc=1; fi
exit $rc
