#!/usr/bin/env bash
# The web face against its sheets — a ratchet (WD6).
#
#   scripts/check-web-design.sh                   # compare the last shoot with the baseline
#   scripts/check-web-design.sh --shoot           # shoot first (scripts/design/shoot-web.sh, a stand, ~8 min)
#   scripts/check-web-design.sh --write-baseline  # accept the current shares as the baseline
#   SHOTS_OUT=testing/screenshots/web-break scripts/check-web-design.sh   # another set of shots (the probe)
#
# Each shot in scripts/design/web-design-map.tsv is set against its phone on a
# built sheet, and the share of pixels that differ is measured
# (scripts/design/compare-web.mjs). The words on a sheet are not the stand's,
# so no share is zero and a plain threshold would say nothing; the shares are
# held in scripts/design/web-design-baseline.tsv, and the gate goes red when
# any share GROWS by more than the slack, or a mapped shot is missing. When a
# share falls, the gate says so and --write-baseline lowers the bar.
# Exit codes: 0 — nothing grew; 1 — something grew, or is missing, or there is
# no baseline; 3 — no shots to measure.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
here="$root/scripts/design"
shots="$root/${SHOTS_OUT:-testing/screenshots/web}"
baseline="${WEB_DESIGN_BASELINE:-$here/web-design-baseline.tsv}"
slack="${WEB_DESIGN_SLACK:-0.5}"   # percentage points a share may wander between two shoots
mode="${1:-}"

if [ "$mode" = "--shoot" ]; then
  SHOTS_OUT="${SHOTS_OUT:-testing/screenshots/web}" "$here/shoot-web.sh" >/dev/null || { echo "✗ съёмка не прошла: scripts/design/shoot-web.sh"; exit 1; }
fi
[ -f "$shots/shots.tsv" ] && [ -d "$shots/sheets" ] || { echo "✗ кадров нет в $shots — сначала scripts/design/shoot-web.sh"; exit 3; }

measured="$(docker run --rm -u "$(id -u):$(id -g)" \
  -v "$here/compare-web.mjs":/tests/compare.mjs:ro -v "$here/web-design-map.tsv":/map:ro \
  -v "$root/panel/design":/design:ro -v "$shots":/shots:ro -w /tests \
  --entrypoint node panel-tests-runner:latest compare.mjs)"

if [ "$mode" = "--write-baseline" ]; then
  { echo "# shot	share of differing pixels, %	left edge off the sheet, px (scripts/check-web-design.sh --write-baseline, $(date +%d.%m.%Y))"; printf '%s\n' "$measured"; } > "$baseline"
  echo "✓ база записана: $(grep -vc '^#' "$baseline") кадров → ${baseline#"$root"/}"
  exit 0
fi
[ -f "$baseline" ] || { echo "✗ базы нет: ${baseline#"$root"/} — scripts/check-web-design.sh --write-baseline"; exit 1; }

python3 - "$baseline" "$slack" <<PY
import sys
base = {}
for line in open(sys.argv[1], encoding="utf-8"):
    if line.startswith("#") or not line.strip(): continue
    shot, share, edge = line.rstrip("\n").split("\t")[:3]
    base[shot] = (float(share), float(edge))
slack = float(sys.argv[2])
EDGE_SLACK = 2.0  # px: the content's left edge may wander this much between shoots
grew, fell, same = [], [], 0
for line in """$measured""".splitlines():
    parts = line.split("\t")
    shot, share = parts[0], parts[1]
    if share == "missing":
        grew.append(f"{shot}: нет кадра или листа ({parts[2] if len(parts) > 2 else ''})"); continue
    now, edge = float(share), float(parts[2])
    if shot not in base: grew.append(f"{shot}: {now:.2f}%, край {edge:g}px — в базе нет"); continue
    was, was_edge = base[shot]
    if edge > was_edge + EDGE_SLACK: grew.append(f"{shot}: левый край дальше от листа: {was_edge:g} → {edge:g}px")
    elif now > was + slack: grew.append(f"{shot}: {was:.2f}% → {now:.2f}%")
    elif now < was - slack or edge < was_edge - EDGE_SLACK: fell.append(f"{shot}: {was:.2f}% → {now:.2f}%, край {was_edge:g} → {edge:g}px")
    else: same += 1
for f in fell: print(f"  ↓ {f}")
for g in grew: print(f"  ✗ {g}")
if grew:
    print(f"✗ расхождение с листами выросло: {len(grew)} из {len(grew) + len(fell) + same}")
    sys.exit(1)
tail = f"; упало {len(fell)} — опустить планку: scripts/check-web-design.sh --write-baseline" if fell else ""
print(f"✓ веб против листов: {same + len(fell)} кадров, ничего не выросло (допуск {slack} п.п.){tail}")
PY
