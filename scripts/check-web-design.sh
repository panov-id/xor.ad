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

# The baseline only goes down: each shot keeps the lower of what the baseline
# holds and what was just measured, share and edge each on its own. Writing the
# latest values let a shot that wandered up within the slack raise the bar
# (Register-2 8.48 → 8.55, Cabinet-offers 6.68 → 6.69 on f6205f4). A shot new to
# the map comes in as measured; a shot measured as missing keeps its line.
if [ "$mode" = "--write-baseline" ]; then
  python3 - "$baseline" "$(date +%d.%m.%Y)" <<PY
import os, sys
path, day = sys.argv[1], sys.argv[2]
old = {}
if os.path.isfile(path):
    for line in open(path, encoding="utf-8"):
        if line.startswith("#") or not line.strip(): continue
        shot, share, edge = line.rstrip("\n").split("\t")[:3]
        old[shot] = (float(share), float(edge))
rows, lowered, kept = [], 0, 0
for line in """$measured""".splitlines():
    parts = line.split("\t")
    shot = parts[0]
    if parts[1] == "missing":
        if shot in old: rows.append((shot, *old[shot])); kept += 1
        continue
    now = (float(parts[1]), float(parts[2]))
    was = old.get(shot, now)
    low = (min(was[0], now[0]), min(was[1], now[1]))
    lowered += low != was
    rows.append((shot, *low))
with open(path, "w", encoding="utf-8") as f:
    f.write(f"# shot\tshare of differing pixels, %\tleft edge off the sheet, px (scripts/check-web-design.sh --write-baseline, {day}; only ever lowered)\n")
    for shot, share, edge in rows:
        f.write(f"{shot}\t{share:.2f}\t{edge:g}\n")
print(f"✓ база записана: {len(rows)} кадров, опущено {lowered}, не измерено и сохранено {kept} → {os.path.relpath(path)}")
PY
  exit $?
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
