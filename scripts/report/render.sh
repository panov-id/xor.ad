#!/usr/bin/env bash
# The status report, measured and printed: one command, one PDF.
#
#   scripts/report/render.sh      # → docs/report-<YYYY-MM-DD>-full.pdf
#
# measure.sh → frames.sh → shots.sh → build.py → Playwright print.
# Intermediates (data/, dc/, shots/, out/) live in $REPORT_WORK, default
# ~/.cache/xor.ad-report — outside the git tree. docs/*.pdf is gitignored.
# $REPORT_SCREENSHOTS points build.py at the gitignored design screenshots when
# this tree has none (a fresh worktree); $REPORT_BRANCH picks the branch measured.
set -euo pipefail
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(cd "$H/../.." && pwd)"
export REPORT_WORK="${REPORT_WORK:-${XDG_CACHE_HOME:-$HOME/.cache}/xor.ad-report}"
mkdir -p "$REPORT_WORK/out"
rm -f "$REPORT_WORK/out/report.pdf"
"$H/measure.sh"
"$H/frames.sh"
"$H/shots.sh"
python3 "$H/build.py"
stamp="$(grep ^measured= "$REPORT_WORK/data/git.env" | cut -d= -f2)"
timeout 300 docker run --rm -e STAMP="$stamp" -v "$REPORT_WORK/out":/work -v "$H/render.mjs":/tests/render.mjs:ro \
  -w /tests --entrypoint node panel-tests-runner:latest render.mjs
pdf="$R/docs/report-$(date +%F)-full.pdf"
cp "$REPORT_WORK/out/report.pdf" "$pdf"
echo "report: $pdf"
