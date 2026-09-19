#!/usr/bin/env bash
# Probe of the colour-scheme gate: red on a stale schemes.css and on a pair under its bar,
# green on the untouched tree. Runs a copy of the script in mktemp; the live files are only read.
#
#   scripts/test_design-palettes.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/panel/design/kit"
cp "$here/design-palettes.py" "$work/scripts/"; cp "$root/panel/design/kit/schemes.css" "$work/panel/design/kit/"
gate="$work/scripts/design-palettes.py"
failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1)); local out code; out=$(python3 "$gate" --check 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$out"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ждали код %s и «%s», получили %s:\n%s\n' "$3" "$1" "$2" "$code" "$(tail -3 <<< "$out")"; failures=$((failures + 1)); fi
}
expect 0 "все не ниже порога" "нетронутые схемы — зелёный"
sed -i 's/--accent-ink: #1a1509/--accent-ink: #fff6f0/' "$work/panel/design/kit/schemes.css"
expect 1 "устарел" "schemes.css правлен руками — красный"
cp "$root/panel/design/kit/schemes.css" "$work/panel/design/kit/"
sed -i 's|"fg": "#f5eed6"|"fg": "#2a2618"|' "$gate"
expect 1 "fg на panel" "текст раста почти цвета карточки — красный с названием пары"
echo
[ "$failures" = 0 ] && { echo "проб: $number — проверка схем краснеет на подсадках и зеленеет на верном"; exit 0; }
echo "✗ проб: $number, провалено: $failures"; exit 1
