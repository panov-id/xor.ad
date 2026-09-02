#!/usr/bin/env bash
# Проверка реестра открытых: каждое нарушение формы обязано покраснеть.
#
#   scripts/test_check-facts-open.sh
#
# Вес и область — не украшение: пока они не проверяются, в реестр попадает
# «важное» и «потом», и через месяц по нему нельзя выбрать, что делать.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-facts-open.sh"
real_registry="$root/docs/facts/open.tsv"

# Живой реестр только читается. До 02.09.2026 случаи гонялись прямо по нему, а
# восстановление держалось на trap: kill -9, OOM или неудачный cp (он не
# проверялся, а set -e здесь нет) оставили бы в дереве файл из одних
# комментариев, и три десятка записей ушли бы тихо. Гейт умеет читать FACTS_OPEN
# — значит копии достаточно, и восстанавливать больше нечего.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
registry="$work/open.tsv"
witness="$work/каким-был.tsv"
cp "$real_registry" "$witness" || { echo "не удалось снять реестр: $real_registry" >&2; exit 2; }
cp "$witness" "$registry"

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(FACTS_OPEN="$registry" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
probe() { cp "$witness" "$registry"; printf '%s\n' "$1" >> "$registry"; }

echo "СЛУЧАИ"
expect 0 'форма, вес, область и срок на месте' 'нынешний реестр в порядке'

probe "$(printf 'probe.weight\t2026-08-31\t-\tважное\tпроба\tchat\tdocs/facts/open.tsv')"
expect 1 'вес «важное» вне объявленных' 'вес вне словаря'

probe "$(printf 'probe.area\t2026-08-31\t-\tproduct\tпроба\tкогда-нибудь\tdocs/facts/open.tsv')"
expect 1 'не объявлена в ontology.json' 'область вне словаря'

probe "$(printf 'probe.legal\t2026-08-31\t-\tlegal\tпроба\tdsa\tdocs/facts/open.tsv')"
expect 1 'без срока' 'обещание из юридических документов без срока'

probe "$(printf 'probe.due\t2026-08-31\tскоро\tproduct\tпроба\tchat\tdocs/facts/open.tsv')"
expect 1 'не дата, не «сейчас» и не «-»' 'срок словом «скоро»'

# Вес и область — строки, а не образцы. Случая на это не было вовсе, и потому
# дыра жила: `grep -qx` без -F трактовал значение из реестра как регулярку.
probe "$(printf 'probe.regex.weight\t2026-08-31\t-\t.*\tпроба\tchat\tdocs/facts/open.tsv')"
expect 1 'вес «.*» вне объявленных' 'вес-регулярка не подходит под словарь'

probe "$(printf 'probe.regex.area\t2026-08-31\t-\tproduct\tпроба\t.*\tdocs/facts/open.tsv')"
expect 1 'область «.*» не объявлена' 'область-регулярка не подходит под словарь'

# id для дубля берётся из самого реестра, а не зашивается. Зашитый G11 стоял
# здесь до 01.09.2026 и молча перестал быть дублем, когда 28cb472 вымыл его из
# реестра: гейт честно молчал, а случай краснел на ровном месте. Любой
# записанный сюда id история рано или поздно вымоет — значит его надо спрашивать.
duplicate_id=$(awk -F'\t' '$1 !~ /^#/ && $1 != "id" && $1 != "" { print $1; exit }' "$witness")
[ -n "$duplicate_id" ] || {
  # Пустой реестр — не повод объявить случай пройденным: тогда «дубль виден»
  # проверялось бы ничем. Отказ громче ложной зелени.
  echo "в реестре нет ни одного id — дубль показать нечем" >&2
  exit 1
}
probe "$(printf '%s\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/facts/open.tsv' "$duplicate_id")"
expect 1 'такой id уже есть' 'повторный id'

probe "$(printf 'probe.where\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/no-such-file_RU.md:1')"
expect 1 'файл, которого нет' 'адрес в никуда'

# Реестр без записей: гейт обязан отказаться, а не отчитаться о нуле. Случай
# добавлен 01.09.2026 после того, как подмена реестра на одни комментарии дала
# «✓ нынешний реестр в порядке» — зелень там, где не проверено ничего.
grep '^#' "$witness" > "$registry" || true
expect 3 'проверять было нечего' 'реестр без записей — отдельный исход, а не успех'

cp "$witness" "$registry"
expect 0 'форма, вес, область и срок на месте' 'копия реестра после всех проб цела'

# Раньше сохранность живого файла доказывал предыдущий случай — он писал в него
# и читал обратно. Теперь он говорит только про копию, а про настоящий реестр
# нужен отдельный свидетель, иначе «проба его не трогает» остаётся обещанием.
number=$((number + 1))
if cmp -s "$real_registry" "$witness"; then
  printf '  ✓ %s\n' 'живой docs/facts/open.tsv не тронут ни одним случаем'
else
  failures=$((failures + 1))
  printf '  ✗ %s\n' 'живой docs/facts/open.tsv изменился — проба пишет туда, куда не должна'
fi

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1; fi
printf 'случаев: %s — каждое нарушение формы видно\n' "$number"
