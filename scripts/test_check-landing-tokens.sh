#!/usr/bin/env bash
# Проба ворот витрин (check-landing-tokens.sh + themes-css.py --landing): чистые
# копии зелёные; один изменённый hex, одна возвращённая зелёная --ok, потерянные
# маркеры и расхождение имён — красные, и сообщение называет переменную, ожидаемое
# и полученное. Работает на копиях в mktemp (SOSED_PLACE_DIR / NEIGHBRO_PLACE_DIR),
# живые витрины только читаются; восстановление — из копии, не через git.
#
#   scripts/test_check-landing-tokens.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
. "$here/group-root.sh"; group="$(group_root "$root")"
gate="$here/check-landing-tokens.sh"
gen="$here/design/themes-css.py"

for brand in sosed neighbro; do
  [ -f "${group}/${brand}.place/landing/index.html" ] || {
    [ -n "${SOSED_PLACE_DIR:-}${NEIGHBRO_PLACE_DIR:-}" ] && continue
    echo "SKIP: нет ${brand}.place рядом — проба витрин не может идти" >&2; exit 0; }
done
src_s="${SOSED_PLACE_DIR:-$group/sosed.place}/landing/index.html"
src_n="${NEIGHBRO_PLACE_DIR:-$group/neighbro.place}/landing/index.html"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/sosed.place/landing" "$work/neighbro.place/landing"
cp "$src_s" "$work/sosed.place/landing/index.html" || exit 2
cp "$src_n" "$work/neighbro.place/landing/index.html" || exit 2
cp "$work/sosed.place/landing/index.html" "$work/sosed.bak"
cp "$work/neighbro.place/landing/index.html" "$work/neighbro.bak"
export SOSED_PLACE_DIR="$work/sosed.place" NEIGHBRO_PLACE_DIR="$work/neighbro.place"
failures=0

expect() {  # expect <код> <подстрока> <описание>
  local output code
  output=$(bash "$gate" 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ждали код %s и «%s», получили %s:\n%s\n' "$3" "$1" "$2" "$code" "$(tail -5 <<< "$output")"; failures=$((failures + 1)); fi
}
restore() { cp "$work/sosed.bak" "$SOSED_PLACE_DIR/landing/index.html"; cp "$work/neighbro.bak" "$NEIGHBRO_PLACE_DIR/landing/index.html"; }

expect 0 "значения витрин равны темам" "чистые копии: зелёное"

# отрицательный контроль: один hex в блоке sosed (--panel тёмной темы #262019 -> #262018)
sed -i '0,/--panel: #262019;/s//--panel: #262018;/' "$SOSED_PLACE_DIR/landing/index.html"
expect 4 "expected '#262019', actual '#262018'" "один hex изменён: красное, с ожидаемым и полученным"
expect 4 "--panel" "…и названа переменная"
restore
expect 0 "значения витрин равны темам" "восстановлено: зелёное"

# neighbro: акцент crimson в светлой теме
sed -i '0,/--accent-text: #b32922;/s//--accent-text: #b32923;/' "$NEIGHBRO_PLACE_DIR/landing/index.html"
expect 4 "neighbro" "hex у neighbro изменён: красное и названо по витрине"
restore

# зелёная --ok вернулась вне блока
sed -i '0,/<style>/s//<style>\n  :root{ --ok:#9ecb7a; }/' "$SOSED_PLACE_DIR/landing/index.html"
expect 1 "только у sosed:    --ok" "--ok вернулся у одной витрины: имена разошлись, красное"
out=$(python3 "$gen" --landing --check 2>&1); code=$?
if [ "$code" = 1 ] && grep -qF -- "--ok: #9ecb7a declared outside the generated block" <<< "$out"; then
  printf '  ✓ %s\n' "--ok вне блока: генератор красный и называет переменную и значение"
else printf '  ✗ --ok вне блока — ждали код 1, получили %s:\n%s\n' "$code" "$(tail -4 <<< "$out")"; failures=$((failures + 1)); fi
restore

# переменная объявлена вне блока снова (--border:#725a3f)
sed -i '0,/<style>/s//<style>\n  :root{ --border:#725a3f; }/' "$NEIGHBRO_PLACE_DIR/landing/index.html"
expect 4 "--border: #725a3f declared outside" "старый --border вне блока: красное"
restore

# правило ядра изменено в блоке
sed -i '0,/\.ui-danger { background: transparent;/s//.ui-danger { background: red;/' "$SOSED_PLACE_DIR/landing/index.html"
expect 4 ".ui-danger { background }" "правило кнопки изменено: красное и названо"
restore

# цвет строки браузера: свой hex в <meta theme-color>
sed -i 's#<meta name="theme-color" content="[^"]*">#<meta name="theme-color" content="\#123456">#' "$SOSED_PLACE_DIR/landing/index.html"
expect 4 "<meta theme-color>: expected" "свой hex в theme-color: красное"
restore

# маркеры потеряны
sed -i 's#/\* END kit \*/##' "$SOSED_PLACE_DIR/landing/index.html"
expect 4 "has no '/* BEGIN kit" "маркер END потерян: красное"
restore

# имена: у sosed лишний токен (старый контроль ворот)
sed -i '0,/<style>/s//<style>\n  :root{ --extra-token: 1; }/' "$SOSED_PLACE_DIR/landing/index.html"
expect 1 "только у sosed" "лишнее имя токена: красное"
restore
expect 0 "значения витрин равны темам" "после всех откатов: зелёное"

# соседа нет: генератор пропускает с заметкой, не падает
out=$(SOSED_PLACE_DIR="$work/нет-такого" NEIGHBRO_PLACE_DIR="$work/нет-такого-тоже" python3 "$gen" --landing --check 2>&1); code=$?
if [ "$code" = 0 ] && grep -qF "SKIP sosed" <<< "$out" && grep -qF "SKIP neighbro" <<< "$out"; then
  printf '  ✓ %s\n' "соседей нет: пропуск с заметкой, код 0"
else printf '  ✗ соседей нет — ждали код 0 и SKIP, получили %s:\n%s\n' "$code" "$(tail -4 <<< "$out")"; failures=$((failures + 1)); fi

if [ "$failures" -gt 0 ]; then echo "test_check-landing-tokens: $failures провал(ов)"; exit 1; fi
echo "test_check-landing-tokens: всё как задумано"
