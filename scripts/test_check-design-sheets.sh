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

# no sheets at all
rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3, как у остальных ворот"

echo
if [ "$failures" -gt 0 ]; then echo "✗ проб: $number, провалено: $failures"; exit 1; fi
echo "проб: $number — ворота краснеют на каждой подсадке и зеленеют на нетронутом"
