#!/usr/bin/env bash
# Probe of the sheet build: parameters and data-if land in the flat sheet, an
# unknown symbol and a stale built sheet go red. Runs on a copy of the script
# in mktemp, so the live panel/design is never touched.
#
#   scripts/test_build-design-sheets.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/panel/design/sheets" "$work/panel/design/kit"
cp "$here/build-design-sheets.py" "$work/scripts/"
build="$work/scripts/build-design-sheets.py"
cat > "$work/panel/design/kit/components.svg" <<'K'
<svg xmlns="http://www.w3.org/2000/svg">
<symbol id="pill" data-p-w="120" data-p-label="Дальше" data-p-count=""><rect width="{w}" height="44" rx="22"/><text x="{w/2}" y="28">{label}</text><g data-if="count"><text x="{w-8}">{count}</text></g><g data-if="!count"><text>нет счётчика</text></g></symbol>
</svg>
K
sheet() { printf '<svg xmlns="http://www.w3.org/2000/svg" width="375" height="812">%s</svg>\n' "$1" > "$work/panel/design/sheets/screen-t.svg"; }
failures=0; number=0
expect() {  # expect <код> <подстрока в выводе или в листе> <описание>
  number=$((number + 1)); local out code
  out=$(python3 "$build" ${4:-} 2>&1); code=$?
  out="$out$(cat "$work/panel/design/screen-t.svg" 2>/dev/null)"
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$out"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ждали код %s и «%s», получили %s:\n%s\n' "$3" "$1" "$2" "$code" "$(tail -c 400 <<< "$out")"; failures=$((failures+1)); fi
}
sheet '<use href="kit/components.svg#pill" x="16" y="700" data-w="200" data-label="Отправить"/>'
expect 0 'x="100"' "арифметика {w/2} подставлена из data-w"
expect 0 '>Отправить<' "подпись подставлена"
expect 0 'translate(16,700)' "use стал сдвинутой группой"
expect 0 'нет счётчика' "data-if=!count оставлен при пустом счётчике"
sheet '<use href="kit/components.svg#pill" data-count="3"/>'
expect 0 'x="112"' "data-if=count оставлен при счётчике 3, ширина по умолчанию 120"
sheet '<use href="kit/components.svg#nope"/>'
expect 1 'нет символа #nope' "неизвестный символ — красный"
sheet '<use href="kit/components.svg#pill"/>'
python3 "$build" >/dev/null
expect 0 'все собраны' "свежий лист — зелёный" --check
sed -i 's/Дальше/Назад/' "$work/panel/design/kit/components.svg"
expect 1 'не совпадает с исходником' "кит поменялся, лист не пересобран — красный" --check
echo
[ "$failures" = 0 ] && { echo "проб: $number — сборка краснеет на подсадках и зеленеет на верном"; exit 0; }
echo "✗ проб: $number, провалено: $failures"; exit 1
