#!/usr/bin/env bash
# Probe of the text gate: it must go red on a line that leaves the phone and on
# text lying on text, and stay green on an untouched sheet. Established
# 2026-09-18 with the gate, by the project rule "a test that has never failed
# proves nothing". A one-frame fixture is written into mktemp, broken there, and
# the gate is pointed at it through DESIGN_DIR.
#
#   scripts/test_check-design-text.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-design-text.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/design"
sheet="$work/design/screen-25.svg"
# A one-frame fixture, not a live sheet: live sheets are rebuilt from the kit and the anchor line
# below moved into a symbol twice on 2026-09-19, leaving the probe with nothing to plant into.
fixture='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="900" viewBox="0 0 480 900"><style>.k-title{font-size:20px;font-weight:600;fill:#f0e7dc}.k-body{font-size:16px;fill:#f0e7dc}</style><rect width="480" height="900" style="fill:#ece4d8"/><g transform="translate(48,40)"><rect x="-1" y="-1" width="377" height="814" rx="24" style="fill:#0d0b0a"/><text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки</text></g></svg>'
printf '%s\n' "$fixture" > "$work/pristine.svg"; cp "$work/pristine.svg" "$sheet"

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  # a probe whose injection did not land proves nothing: the sheet must differ from the original, except for the untouched case
  if [ "$1" != 0 ] && cmp -s "$sheet" "$work/pristine.svg"; then
    printf '  ✗ %s — подсадка не легла: sed не нашёл место в листе\n' "$3"; failures=$((failures + 1)); return
  fi
  local output; output=$(DESIGN_DIR="$work/design" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then
    printf '  ✓ %s\n' "$3"
  else
    printf '  ✗ %s — ожидали код %s и «%s», получили код %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"
    failures=$((failures + 1))
  fi
}
restore() { cp "$work/pristine.svg" "$sheet"; }

expect 0 "ни одна не выходит за кадр" "нетронутый лист — зелёный"

# a line that runs past the phone: planted in the gap under the header, where no card hides it
sed -i '0,/<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text>/s//<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text><text x="16" y="66" class="k-body">эта строка нарочно длиннее, чем 375 пикселей ширины телефона<\/text>/' "$sheet"
expect 1 "выходит справа" "строка шире кадра — красный с местом и величиной"
restore

# visible text on visible text: a second line at the same place as the header title
sed -i '0,/<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text>/s//<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text><text x="187.5" y="34" text-anchor="middle" class="k-title">Чужие лайки<\/text>/' "$sheet"
expect 1 "под текстом" "текст поверх текста — красный"
restore

# text under a card is hidden, not a defect: the same second line, but a rect over both
sed -i '0,/<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text>/s//<text x="187.5" y="34" text-anchor="middle" class="k-title">Мои лайки<\/text><rect x="0" y="0" width="375" height="56" style="fill:#302720"\/><text x="187.5" y="34" text-anchor="middle" class="k-title">Чужие лайки<\/text>/' "$sheet"
expect 0 "ни одна не выходит за кадр" "текст под карточкой скрыт — зелёный"
restore

# no sheets at all
rm "$work/design"/*.svg
expect 3 "мерить нечего" "пустой каталог — код 3, как у остальных ворот"

echo
if [ "$failures" = 0 ]; then echo "проб: $number — ворота краснеют на каждой подсадке и зеленеют на нетронутом"; exit 0; fi
echo "✗ проб: $number, провалено: $failures"; exit 1
