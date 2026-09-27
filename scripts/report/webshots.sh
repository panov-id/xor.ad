#!/usr/bin/env bash
# Screens of the web face, as its own end-to-end suite leaves them: the stand of
# docker-compose.web.yml is brought up, the specs run with Playwright keeping a
# screenshot of every page at the end of every test, and the pictures land in
# $REPORT_WORK/webshots/run. The suite's tally goes to data/webshots.txt.
#
# The config is patched in a copy of web/e2e under $REPORT_WORK, never in the
# tree (as frames.sh does with depth). The stand is thrown away afterwards.
set -uo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
mkdir -p "$W/data"
rm -rf "$W/webe2e" "$W/webshots"
mkdir -p "$W/webe2e" "$W/webshots"
(cd "$R/web/e2e" && git ls-files -z | xargs -0 cp --parents -t "$W/webe2e")
python3 - "$W/webe2e/playwright.config.ts" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = 'trace: "retain-on-failure",'
if s.count(old) != 1:
    sys.exit("webshots.sh: playwright.config.ts changed, anchor not found: " + old)
open(p, "w").write(s.replace(old, old + '\n    screenshot: "on",'))
PY
cat > "$W/webshots.override.yml" <<YML
services:
  e2e:
    build: { context: "$W/webe2e" }
    volumes:
      - "$W/webshots:/app/results"
YML
project="web-report-$$"
compose=(docker compose -f "$R/docker-compose.web.yml" -f "$W/webshots.override.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
trap '"${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true' EXIT INT TERM
timeout 1500 "${compose[@]}" up --build --abort-on-container-exit --exit-code-from e2e e2e > "$W/data/webshots.log" 2>&1
echo $? > "$W/data/webshots.rc"
grep -E '^\S*e2e\S*\s+\|\s+(\d+ |[0-9]+ )?(passed|failed|flaky|skipped)|[0-9]+ (passed|failed)' "$W/data/webshots.log" \
  | sed -E 's/^[^|]*\| *//' > "$W/data/webshots.txt"
find "$W/webshots" -name '*.png' | sort > "$W/data/webshots.list"
echo "webshots: rc=$(cat "$W/data/webshots.rc"), $(wc -l < "$W/data/webshots.list") pictures; $(tr '\n' ' ' < "$W/data/webshots.txt")"
