#!/usr/bin/env bash
# Probe of the terminal grid gate: red on a run that starts off its column, on a baseline off the grid,
# on a textLength that does not match the cells claimed, and on a wide glyph with no textLength at all;
# green on a clean frame. The fixture is a one-frame terminal sheet in mktemp; DESIGN_DIR points there.
#
#   scripts/test_check-design-grid.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gate="$here/check-design-grid.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/design"
sheet="$work/design/screen-term.svg"
row() { printf '<text x="%s" y="%s" class="tf" textLength="%s" lengthAdjust="spacingAndGlyphs" xml:space="preserve">%s</text>' "$1" "$2" "$3" "$4"; }
fixture() {
cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="820" height="300" viewBox="0 0 820 300"><rect width="820" height="300" style="fill:#302720"/>
<g transform="translate(48,40)" class="term" data-cw="9" data-ch="20" data-pad="16"><rect width="772" height="220" style="fill:#0d0b0a"/>
<style>.term text { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 15px; fill: #f0e7dc; }</style>
$(row 16 31 72 'signal12')
$(row 16 51 45 'depth')
</g></svg>
SVG
}
fixture > "$work/pristine.svg"; cp "$work/pristine.svg" "$sheet"
failures=0; number=0
expect() {
  number=$((number + 1))
  local output; output=$(DESIGN_DIR="$work/design" ONLY=screen-term bash "$gate" screen-term 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ожидали код %s и «%s», получили код %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
}
restore() { cp "$work/pristine.svg" "$sheet"; }

expect 0 "каждый знак стоит в своей клетке" "чистый кадр — зелёный"

sed -i 's|<text x="16" y="31"|<text x="20" y="31"|' "$sheet"
expect 1 "начало не на колонке" "начало строки между колонками — красный"
restore

sed -i 's|y="51" class="tf" textLength="45"|y="57" class="tf" textLength="45"|' "$sheet"
expect 1 "строка не на сетке" "базовая линия между строками — красный"
restore

sed -i 's|textLength="72"|textLength="80"|' "$sheet"
expect 1 "textLength 80 при 8 клетках" "объявленная ширина не равна клеткам — красный"
restore

sed -i 's|textLength="72" lengthAdjust="spacingAndGlyphs" xml:space="preserve">signal12|xml:space="preserve">♥♥♥♥♥♥♥♥|' "$sheet"
expect 1 "знак шире клетки" "широкий знак без объявленной ширины — красный"
restore

rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3"

echo
[ "$failures" = 0 ] && { echo "проб: $number — ворота сетки краснеют на подсадках и зеленеют на верном"; exit 0; }
echo "✗ проб: $number, провалено: $failures"; exit 1
