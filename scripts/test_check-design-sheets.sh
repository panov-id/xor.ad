#!/usr/bin/env bash
# Probe of the sheet ratchet: it must go red when a count grows and stay green
# when nothing changed. Established 2026-09-18 with the gate, by the project
# rule "a test that has never failed proves nothing". The live sheets are only
# read: they are copied into mktemp, broken there, and the gate is pointed at the
# copy through DESIGN_DIR and DESIGN_BASELINE.
#
#   scripts/test_check-design-sheets.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-design-sheets.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/design" && cp "$root"/panel/design/screen-03.svg "$root"/panel/design/screen-08.svg "$work/design/" || { echo "не удалось скопировать листы"; exit 1; }
base="$work/baseline.tsv"

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(DESIGN_DIR="$work/design" DESIGN_BASELINE="$base" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then
    printf '  ✓ %s\n' "$3"
  else
    printf '  ✗ %s — ожидали код %s и «%s», получили код %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"
    failures=$((failures + 1))
  fi
}
restore() { cp "$root"/panel/design/screen-03.svg "$work/design/screen-03.svg"; }

expect 1 "базовой линии нет" "без базы — красный, а не тихий ноль"
DESIGN_DIR="$work/design" DESIGN_BASELINE="$base" bash "$gate" --write-baseline >/dev/null
expect 0 "ни одна мера не выросла" "нетронутые листы против своей базы — зелёный"

# a type size off the scale
sed -i 's/font-size: 16px/font-size: 15px/' "$work/design/screen-03.svg"
expect 1 "sizes_off_scale" "кегль 15 вне шкалы — красный с именем меры"
restore

# a placeholder added
sed -i 's|</svg>|<text>[текст не задан: проба]</text></svg>|' "$work/design/screen-03.svg"
expect 1 "placeholders" "новая заглушка — красный"
restore

# a text set in the raw accent
sed -i 's|</svg>|<text fill="#bd4b2a">проба</text></svg>|' "$work/design/screen-03.svg"
expect 1 "accent_text" "текст сырым акцентом — красный"
restore

# a colour outside the tokens
sed -i 's|</svg>|<rect fill="#123456"/></svg>|' "$work/design/screen-03.svg"
expect 1 "colours_off_token" "цвет вне токенов — красный"
restore

# a control rimmed in --fg and 40 px tall — the rim colour must not hide it (me cluster, 2026-09-18)
sed -i 's|</svg>|<rect x="0" y="0" width="295" height="40" rx="13" style="fill:#262019;stroke:#f0e7dc;stroke-width:1;"/></svg>|' "$work/design/screen-03.svg"
expect 1 "small_bordered_controls" "рамка --fg высотой 40 — красный"
restore

# an invisible hit zone narrower than 44
sed -i 's|</svg>|<rect x="0" y="0" width="40" height="44" rx="8" fill="none" data-hit="44"/></svg>|' "$work/design/screen-03.svg"
expect 1 "small_bordered_controls" "зона data-hit шириной 40 — красный"
restore

# a pill by width (the console rib 3×20, rx 1.5) is not a radius off the scale
sed -i 's|</svg>|<rect x="0" y="0" width="3" height="20" rx="1.5" fill="#d56343"/></svg>|' "$work/design/screen-03.svg"
expect 0 "ни одна мера не выросла" "таблетка по ширине 3×20 rx 1.5 — не радиус вне шкалы"
restore

# a truncated element — the sheet is no longer XML and no browser draws past it
sed -i 's|</svg>|<text x="1" y="1" class="meta"\n</svg>|' "$work/design/screen-03.svg"
expect 1 "не разбирается как XML" "обрезанный элемент — красный до всякого счёта"
restore

# a count that fell is reported, not failed: a placeholder enters the baseline, then leaves
sed -i 's|</svg>|<text>[текст не задан: проба]</text></svg>|' "$work/design/screen-03.svg"
DESIGN_DIR="$work/design" DESIGN_BASELINE="$base" bash "$gate" --write-baseline >/dev/null
restore
expect 0 "опустилось placeholders" "мера опустилась — зелёный с подсказкой снизить базу"
DESIGN_DIR="$work/design" DESIGN_BASELINE="$base" bash "$gate" --write-baseline >/dev/null

# a terminal sheet has its own grid gate and its own scale: the ratchet leaves it alone
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><g class="term" data-cw="9" data-ch="20" data-pad="16"><rect x="0" y="0" width="100" height="40" rx="9" style="fill:#0d0b0a"/><text x="16" y="31" style="font-size: 15px">проба</text></g></svg>' > "$work/design/screen-term.svg"
expect 0 "ни одна мера не выросла" "терминальный лист не меряется храповиком — зелёный"
rm "$work/design/screen-term.svg"
restore

# the generated palette block: skipped when it matches kit/schemes.css, counted when a hand edited it
mkdir -p "$work/design/kit"
printf '%s\n' '    .k-probe { --accent: #0f6f86; --fg: #14201e; }' > "$work/design/kit/schemes.css"
python3 - "$work/design/screen-03.svg" "$work/design/kit/schemes.css" <<'PY'
import sys, pathlib
sheet, schemes = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
t = sheet.read_text(encoding='utf-8')
sheet.write_text(t.replace('<style>', '<style>\n' + schemes.read_text(encoding='utf-8').rstrip(), 1), encoding='utf-8')
PY
expect 0 "ни одна мера не выросла" "блок палитр, совпадающий с schemes.css — не считается"
sed -i 's|--accent: #0f6f86|--accent: #0f6f87|' "$work/design/screen-03.svg"
expect 1 "colours_off_token" "блок палитр, поправленный рукой — считается, красный"
rm -rf "$work/design/kit"
restore

# no sheets at all
rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3, как у остальных ворот"

echo
if [ "$failures" -gt 0 ]; then echo "✗ проб: $number, провалено: $failures"; exit 1; fi
echo "проб: $number — ворота краснеют на каждой подсадке и зеленеют на нетронутом"
