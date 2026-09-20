#!/usr/bin/env bash
# Probe of the spacing gate: red on a button 4 px from its block's bottom and on a caption
# off the centre of a lone button, and through an unfilled outline over it; green on a clean sheet
# and on a button a painted sheet covers. The sheet is a one-frame fixture written
# into mktemp (a live sheet may carry real defects and would not start green); DESIGN_DIR points there.
#
#   scripts/test_check-design-spacing.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-design-spacing.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/design"
sheet="$work/design/screen-25.svg"
fixture='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="900" viewBox="0 0 480 900"><rect width="480" height="900" style="fill:#ece4d8"/><g transform="translate(48,40)"><rect x="-1" y="-1" width="377" height="814" rx="24" style="fill:#0d0b0a"/><text x="16" y="40" style="font-size:20px;fill:#f0e7dc">Мои лайки</text></g></svg>'
printf '%s\n' "$fixture" > "$work/pristine.svg"; cp "$work/pristine.svg" "$sheet"
anchor='>Мои лайки</text>'
failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  if [ "$1" != 0 ] && cmp -s "$sheet" "$work/pristine.svg"; then
    printf '  ✗ %s — подсадка не легла: якорь не найден в листе\n' "$3"; failures=$((failures + 1)); return
  fi
  local output; output=$(DESIGN_DIR="$work/design" ONLY=screen-25 bash "$gate" screen-25 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ожидали код %s и «%s», получили код %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
}
plant() { python3 - "$sheet" "$anchor" "$1" <<'P'
import sys; p, anchor, extra = sys.argv[1:]; s = open(p, encoding='utf-8').read()
assert anchor in s, 'якоря нет'; open(p, 'w', encoding='utf-8').write(s.replace(anchor, anchor + extra, 1))
P
}
restore() { cp "$work/pristine.svg" "$sheet"; }
button='<g data-kit="button-primary" transform="translate(40,300)"><rect width="200" height="44" rx="13" style="fill:#bd4b2a"/></g>'

plant "<rect x=\"24\" y=\"280\" width=\"232\" height=\"80\" rx=\"13\" style=\"fill:#262019\"/>$button"
expect 0 "подписи под кнопками по центру" "кнопка в 16 px от низа блока — зелёный"
restore

plant "<rect x=\"24\" y=\"280\" width=\"232\" height=\"68\" rx=\"13\" style=\"fill:#262019\"/>$button"
expect 1 "до низа блока 4 px" "кнопка в 4 px от низа блока — красный с числом"
restore

plant "$button<text x=\"70\" y=\"372\" style=\"font-size:14px;fill:#9a8d7c\" text-anchor=\"start\">причина</text>"
expect 1 "сдвинута от центра" "подпись под одиночной кнопкой не по центру и не с края — красный"
restore

plant "$button<text x=\"140\" y=\"372\" style=\"font-size:14px;fill:#9a8d7c\" text-anchor=\"middle\">причина</text>"
expect 0 "подписи под кнопками по центру" "подпись по центру — зелёный"
restore

off="$button<text x=\"70\" y=\"372\" style=\"font-size:14px;fill:#9a8d7c\" text-anchor=\"start\">причина</text>"
plant "$off<rect x=\"30\" y=\"290\" width=\"220\" height=\"64\" style=\"fill:none;stroke:#9a8d7c\"/>"
expect 1 "сдвинута от центра" "контур без заливки поверх кнопки её не прячет — красный"
restore

plant "$off<rect x=\"0\" y=\"280\" width=\"375\" height=\"80\" style=\"fill:#302720\"/>"
expect 0 "подписи под кнопками по центру" "кнопка под листом не видна — мерить нечего, зелёный"
restore

plant "$button<text x=\"70\" y=\"372\" class=\"cap\" style=\"font-size:13px;fill:#6b5f4c\">подпись листа</text>"
expect 0 "подписи под кнопками по центру" "подпись листа (class cap) под кнопкой — не подпись кнопки, зелёный"
restore

plant "<rect x=\"24\" y=\"740\" width=\"232\" height=\"100\" rx=\"13\" style=\"fill:#262019\"/><g data-kit=\"button-primary\" transform=\"translate(40,760)\"><rect width=\"200\" height=\"44\" rx=\"13\" style=\"fill:#bd4b2a\"/></g>"
expect 0 "подписи под кнопками по центру" "блок уходит за край телефона — низ не виден, зелёный"
restore

plant "<rect x=\"24\" y=\"744\" width=\"232\" height=\"68\" rx=\"13\" style=\"fill:#262019\"/><g data-kit=\"button-primary\" transform=\"translate(40,764)\"><rect width=\"200\" height=\"44\" rx=\"13\" style=\"fill:#bd4b2a\"/></g>"
expect 1 "до низа блока 4 px" "блок кончается ровно на нижнем краю телефона — меряется, красный"
restore

kitfile="$work/design/app-kit.svg"
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400" viewBox="0 0 700 400"><rect width="700" height="400" style="fill:#302720"/><g class="k-dark"><rect x="20" y="20" width="600" height="300" rx="13" style="fill:var(--bg,#0d0b0a)"/><rect x="40" y="40" width="232" height="68" rx="13" style="fill:#262019"/><g data-kit="button-primary" transform="translate(56,60)"><rect width="200" height="44" rx="13" style="fill:#bd4b2a"/></g></g></svg>' > "$kitfile"
number=$((number + 1))
out=$(DESIGN_DIR="$work/design" bash "$gate" app-kit 2>&1); code=$?
if [ "$code" = 1 ] && grep -qF "до низа блока 4 px" <<< "$out"; then printf '  ✓ %s\n' "кит меряется: кнопка в 4 px от низа блока на app-kit — красный"
else printf '  ✗ кит меряется — ожидали код 1, получили %s:\n%s\n' "$code" "$(tail -3 <<< "$out")"; failures=$((failures + 1)); fi
rm -f "$kitfile"

number=$((number + 1))
out=$(DESIGN_DIR="$work/design" ONLY=screen-25 bash "$gate" screen-25 2>&1); code=$?
if [ "$code" = 0 ] && grep -qF "кнопок кита нет" <<< "$out"; then printf '  ✓ %s\n' "лист без кнопок — зелёный, но сказано вслух"
else printf '  ✗ лист без кнопок — ожидали код 0 и «кнопок кита нет», получили %s:\n%s\n' "$code" "$(tail -3 <<< "$out")"; failures=$((failures + 1)); fi

rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3"

echo
[ "$failures" = 0 ] && { echo "проб: $number — ворота отступов краснеют на подсадках и зеленеют на верном"; exit 0; }
echo "✗ проб: $number, провалено: $failures"; exit 1
