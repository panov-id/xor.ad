#!/usr/bin/env bash
# Probe of the spacing gate: red on a button 4 px from its block's bottom and on a caption
# off the centre of a lone button, green on a clean sheet. The sheet is a one-frame fixture written
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

rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3"

echo
[ "$failures" = 0 ] && { echo "проб: $number — ворота отступов краснеют на подсадках и зеленеют на верном"; exit 0; }
echo "✗ проб: $number, провалено: $failures"; exit 1
