#!/usr/bin/env bash
# Проверка ворот реестра решений: каждое расхождение обязано покраснеть.
#
#   scripts/test_check-facts-decisions.sh
#
# Пробы у этих ворот не было до 03.09.2026 — пункт gates.without.probe. Ворота,
# чей зелёный отчёт никто не видел красным, сообщают не «сошлось», а «я
# отработал»: сверка держится на grep по предмету решения, и достаточно ошибки
# в одном условии, чтобы предмет «находился» всегда, а даты не сверялись вовсе.
#
# Живой реестр только читается: гейт умеет брать путь из FACTS_DECISIONS, и
# случаи гоняются по копии во временном каталоге.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-facts-decisions.sh"
real_registry="$root/docs/facts/decisions.tsv"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
registry="$work/decisions.tsv"
witness="$work/каким-был.tsv"
cp "$real_registry" "$witness" || { echo "не удалось снять реестр: $real_registry" >&2; exit 2; }

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(FACTS_DECISIONS="$registry" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
probe() { cp "$witness" "$registry"; printf '%s\n' "$1" >> "$registry"; }

# Опора для проб — живая строка реестра, а не выдуманная: предмет и дата берутся
# из неё на месте. Вписанные сюда, они разъехались бы при первой правке спеки.
row=$(grep -v '^#' "$witness" | grep -v '^id	' | head -1)
date=$(printf '%s' "$row" | cut -f2)
ru=$(printf '%s' "$row" | cut -f3)
en=$(printf '%s' "$row" | cut -f4)
subject_ru=$(printf '%s' "$row" | cut -f5)
subject_en=$(printf '%s' "$row" | cut -f6)

echo "СЛУЧАИ"
cp "$witness" "$registry"
expect 0 'даты сходятся везде' 'нынешний реестр в порядке'

# Предмет — якорь, и он обязан найтись дословно. Переименовали формулировку в
# спеке — реестр краснеет, а не молчит: это его единственный способ заметить,
# что решение переписали.
probe "$(printf 'probe.subject\t%s\t%s\t%s\t%s\t%s' "$date" "$ru" "$en" \
  'такого предмета в спеке нет и не было' "$subject_en")"
expect 1 'предмет решения не найден' 'предмет решения переименован'

# Дата на строке предмета — вторая половина сверки. Ради неё гейт и написан:
# 31.08.2026 половины спеки чата разошлись на два дня, и ни парность, ни
# сравнение множеств дат этого не видели.
other=$(printf '%s' "$date" | sed 's/^2026-09/2025-01/; s/^2026-08/2025-01/')
probe "$(printf 'probe.date\t%s\t%s\t%s\t%s\t%s' "$other" "$ru" "$en" "$subject_ru" "$subject_en")"
expect 1 'дата разошлась с реестром' 'дата в реестре не та, что на строке'

probe "$(printf 'probe.file\t%s\txor.ad/docs/такого-файла-нет.md\t%s\t%s\t%s' \
  "$date" "$en" "$subject_ru" "$subject_en")"
expect 1 'нет файла' 'адрес указывает на файл, которого нет'

# Английская половина проверяется отдельно от русской: одинаковый предмет в
# обеих колонках прошёл бы, если бы гейт сверял только первую.
probe "$(printf 'probe.en\t%s\t%s\t%s\t%s\t%s' "$date" "$ru" "$en" "$subject_ru" \
  'no such subject in the English half')"
expect 1 '(EN): предмет решения не найден' 'расходится только английская половина'

# Пустой реестр — отдельный исход, а не успех: «ноль решений сверено» и «даты
# сходятся везде» это разные утверждения, и гейт обязан их различать.
grep '^#' "$witness" > "$registry"
expect 3 'проверять было нечего' 'реестр без записей — отдельный исход'

# Отрицательный контроль на сам набор: если живой реестр пострадал от проб,
# всё выше не значит ничего.
number=$((number + 1))
if diff -q "$witness" "$real_registry" >/dev/null; then
  printf '  ✓ живой docs/facts/decisions.tsv не тронут ни одним случаем\n'
else
  failures=$((failures + 1)); printf '  ✗ живой реестр изменился за время проб\n'
fi

echo
if [ "$failures" -gt 0 ]; then
  printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1
fi
printf 'случаев: %s — каждое расхождение видно\n' "$number"
