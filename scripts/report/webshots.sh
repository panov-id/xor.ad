#!/usr/bin/env bash
# The web face for the report, in two runs on throwaway stands:
#   1. its end-to-end suite (docker-compose.web.yml) — the tally goes to
#      data/webshots.txt and the exit code to data/webshots.rc;
#   2. scripts/design/shoot-web.sh — every screen the web opens, named, a
#      light and a dark frame each, for both brands, next to the mockup sheets; then scripts/check-web-design.sh
#      against its baseline — its last line goes to data/webdesign.txt.
# The pictures of the report's web section are the shoot's (data/webshots.list):
# a screen is named by the state it was shot in, not by a test that happened to
# end on it.
set -uo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
mkdir -p "$W/data"
rm -rf "$W/webshots"
mkdir -p "$W/webshots"

# The compose file mounts web/e2e/results; made here, as run-web-tests.sh does,
# or Docker makes it as root and the suite cannot write (seen in a fresh tree).
mkdir -p "$R/web/e2e/results"
project="web-report-$$"
compose=(docker compose -f "$R/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
trap '"${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true' EXIT INT TERM
timeout 1500 "${compose[@]}" up --build --abort-on-container-exit --exit-code-from e2e e2e > "$W/data/webshots.log" 2>&1
echo $? > "$W/data/webshots.rc"
"${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
grep -E '[0-9]+ (passed|failed|flaky|skipped)' "$W/data/webshots.log" | sed -E 's/^[^|]*\| *//' > "$W/data/webshots.txt"

shots="$R/testing/screenshots/web"
"$R/scripts/design/shoot-web.sh" > "$W/data/shootweb.log" 2>&1
echo $? > "$W/data/shootweb.rc"
"$R/scripts/check-web-design.sh" > "$W/data/webdesign.log" 2>&1
tail -1 "$W/data/webdesign.log" > "$W/data/webdesign.txt"
if [ -f "$shots/shots.tsv" ]; then
  cp "$shots/shots.tsv" "$W/data/shootweb.tsv"
  awk -F'\t' '$2 == "ok" { print $1 }' "$shots/shots.tsv" | while read -r name; do
    for theme in light dark; do
      [ -f "$shots/$name-$theme.png" ] && cp "$shots/$name-$theme.png" "$W/webshots/" && echo "$W/webshots/$name-$theme.png"
    done
  done > "$W/data/webshots.list"
else
  : > "$W/data/webshots.list"
fi
echo "webshots: e2e rc=$(cat "$W/data/webshots.rc") $(tr '\n' ' ' < "$W/data/webshots.txt"); shoot rc=$(cat "$W/data/shootweb.rc"), $(wc -l < "$W/data/webshots.list") screens; $(cat "$W/data/webdesign.txt")"
