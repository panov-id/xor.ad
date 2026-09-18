#!/usr/bin/env bash
# The mock-up sheets against the application's design system — a ratchet.
#
#   scripts/check-design-sheets.sh                  # measure and compare with the baseline
#   scripts/check-design-sheets.sh --write-baseline # accept the current counts as the baseline
#   DESIGN_DIR=/some/dir scripts/check-design-sheets.sh   # another set of sheets (the probe)
#
# Seven counts over panel/design/screen-*.svg, each of which the plan of
# 2026-09-18 (docs/reviews/PLAN_2026-09-18_screens-to-ideal_RU.md, gate I1–I3, I5)
# wants at zero: type sizes off the six-step scale, stroke widths other than 1 and
# 2, corner radii off the radius scale, colours that are not tokens, "[text not
# set]" placeholders, text set in the raw accent (#bd4b2a, 3.93:1), and controls
# — any rimmed rect or a data-hit zone — shorter or narrower than 44 px. None of them is zero today, so a plain gate would
# be red for a week and prove nothing. Instead the counts are held in
# docs/facts/design-sheets-baseline.tsv and the gate goes red when any count
# GROWS; when a count falls, the gate says so and --write-baseline lowers the bar.
# Exit codes: 0 — nothing grew; 1 — something grew, or the baseline is missing;
# 3 — no sheets to measure.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
design="${DESIGN_DIR:-$root/panel/design}"
baseline="${DESIGN_BASELINE:-$root/docs/facts/design-sheets-baseline.tsv}"
mode="${1:-}"
python3 - "$design" "$baseline" "$mode" <<'PY'
import sys, re, pathlib
design, baseline, mode = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
sheets = sorted(design.glob('screen-*.svg'))
if not sheets:
    print('✗ листов не найдено — мерить нечего'); sys.exit(3)
SIZES = {26, 20, 16, 14, 13, 11}
STROKES = {1.0, 2.0}
RIMS = {'#80705a', '#857562', '#f0e7dc', '#1c140d', '#221a12'}   # rims a control may wear; the accent rim marks a board tile, not a control
RADII = {0, 4, 8, 13, 24, 999}          # 4 — domino tiles (a local form), 24 — the phone frame, not the product
TOKENS = {
    # dark
    '#0d0b0a', '#262019', '#302720', '#3a2e20', '#80705a', '#f0e7dc', '#9a8d7c', '#6b5f4c',
    '#bd4b2a', '#fff6f0', '#e0714f', '#d56343', '#9ecb7a', '#ef7a6a',
    # light
    '#ece4d8', '#fdfaf4', '#e6dbc9', '#221a12', '#857562', '#1c140d', '#983c22', '#4b712c', '#a3311f', '#9ecb7a',
    # sheet chrome: the sheet's own background, captions, the black of family C
    '#000', '#000000', '#fff', '#ffffff', '#ab9d88', '#655847', '#241c14', '#17130f',
    # board cells (screen 18), agreed as decorative
    '#2a2018', '#5a4634',
}
counts = {k: 0 for k in ('sizes_off_scale', 'strokes_off_scale', 'radii_off_scale',
                         'colours_off_token', 'placeholders', 'accent_text', 'small_bordered_controls')}
detail = {k: {} for k in counts}
def bump(key, sheet, what):
    counts[key] += 1; d = detail[key]; d[what] = d.get(what, 0) + 1
for f in sheets:
    t = f.read_text(encoding='utf-8')
    style = re.search(r'<style>(.*?)</style>', t, re.S)
    css = style.group(1) if style else ''
    cls_fill = {}
    for m in re.finditer(r'\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}', css):
        fm = re.search(r'fill:\s*(#[0-9a-fA-F]{3,6})', m.group(2))
        if fm: cls_fill[m.group(1)] = fm.group(1).lower()
    for m in re.finditer(r'font-size:\s*([0-9.]+)px', t):
        if float(m.group(1)) not in SIZES: bump('sizes_off_scale', f.name, m.group(1))
    for m in re.finditer(r'font-size="([0-9.]+)"', t):
        if float(m.group(1)) not in SIZES: bump('sizes_off_scale', f.name, m.group(1))
    for m in re.finditer(r'stroke-width[=:]"?([0-9.]+)', t):
        if float(m.group(1)) not in STROKES: bump('strokes_off_scale', f.name, m.group(1))
    for m in re.finditer(r'<rect[^>]*>', t):
        tag = m.group(0)
        rx = re.search(r'\brx="([0-9.]+)"', tag); h = re.search(r'\bheight="([0-9.]+)"', tag)
        if not rx: continue
        r = float(rx.group(1)); hv = float(h.group(1)) if h else None
        w = re.search(r'\bwidth="([0-9.]+)"', tag); wv = float(w.group(1)) if w else None
        if hv is not None and (abs(2 * r - hv) < 0.01 or hv <= 16): continue   # a pill (--r-pill) or an icon, not a component
        if wv is not None and abs(2 * r - wv) < 0.01: continue                 # a pill by width: the console's 3×20 rib
        if r not in RADII: bump('radii_off_scale', f.name, rx.group(1))
    for m in re.finditer(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b', t):
        c = m.group(0).lower()
        if c not in TOKENS: bump('colours_off_token', f.name, c)
    counts['placeholders'] += t.count('текст не задан')
    for m in re.finditer(r'<text([^>]*)>', t):
        attrs = m.group(1)
        fill = None
        fm = re.search(r'fill="(#[0-9a-fA-F]{3,6})"', attrs) or re.search(r'fill:\s*(#[0-9a-fA-F]{3,6})', attrs)
        if fm: fill = fm.group(1).lower()
        else:
            cm = re.search(r'class="([a-zA-Z0-9_-]+)"', attrs)
            if cm: fill = cls_fill.get(cm.group(1))
        if fill == '#bd4b2a': bump('accent_text', f.name, f.name)
    # A control is a rect with any rim colour (not only --border-control: the me
    # cluster's lens of 2026-09-18 found fifteen rims in --fg that the first
    # version never counted) or an invisible hit zone marked data-hit. Rims of
    # 16 px and less are icons; the phone frame is 812 and never a control.
    for m in re.finditer(r'<rect[^>]*>', t):
        tag = m.group(0)
        rim = re.search(r'stroke[=:]"?(#[0-9a-fA-F]{3,6})', tag)
        hit = 'data-hit=' in tag
        if not (rim and rim.group(1).lower() in RIMS) and not hit: continue
        h = re.search(r'\bheight="([0-9.]+)"', tag); w = re.search(r'\bwidth="([0-9.]+)"', tag)
        hv = float(h.group(1)) if h else 44; wv = float(w.group(1)) if w else 44
        if (hv <= 24 and not hit) or hv >= 800: continue   # a glyph (checkbox box, menu icon) — its zone is a data-hit rect
        if hv < 44 or (hit and wv < 44): bump('small_bordered_controls', f.name, f'{wv:g}×{hv:g}')
if mode == '--write-baseline':
    baseline.write_text('# Ratchet baseline of scripts/check-design-sheets.sh: a count may fall, never grow.\n'
                        '# Rewritten by --write-baseline; the date is the day the bar was lowered.\n'
                        'measure\tvalue\n' + ''.join(f'{k}\t{v}\n' for k, v in counts.items()), encoding='utf-8')
    print('база записана: ' + ', '.join(f'{k}={v}' for k, v in counts.items())); sys.exit(0)
if not baseline.exists():
    print('✗ базовой линии нет: ' + str(baseline) + ' — сначала --write-baseline'); sys.exit(1)
base = {}
for line in baseline.read_text(encoding='utf-8').splitlines():
    if line.startswith('#') or not line.strip() or line.startswith('measure'): continue
    k, v = line.split('\t'); base[k] = int(v)
grew, fell = [], []
for k, v in counts.items():
    b = base.get(k)
    if b is None: grew.append(f'{k}: нет в базе'); continue
    if v > b:
        top = sorted(detail[k].items(), key=lambda kv: -kv[1])[:3]
        grew.append(f'{k}: {v} > {b} — ' + ', '.join(f'{w}×{n}' for w, n in top))
    elif v < b: fell.append(f'{k}: {v} < {b}')
for g in grew: print('  ✗ ' + g)
for s in fell: print('  · опустилось ' + s + ' — можно снизить базу: --write-baseline')
summary = ', '.join(f'{k}={v}' for k, v in counts.items())
if grew:
    print(f'✗ листов: {len(sheets)} — выросло мер: {len(grew)} ({summary})'); sys.exit(1)
print(f'листов: {len(sheets)} — ни одна мера не выросла ({summary})')
PY
