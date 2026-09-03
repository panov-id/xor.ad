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
expect 1 'не дата, не «сейчас», не «с запуском», не «-»' 'срок словом «скоро»'

# Сообщение и словарь — одно и то же или ничто. 03.09.2026 они разъехались:
# гейт со снятым «с запуском» отвергал значение и тут же перечислял его среди
# допустимых. Случай берёт слова из живого текста ошибки и подставляет каждое
# как настоящий срок: перечисленное обязано приниматься. Если следующий вид
# срока добавят в проверку, забыв про текст, слово в перечислении не появится
# и случай пройдёт вхолостую — поэтому счёт слов тоже сверяется.
listed=$(probe "$(printf 'probe.words\t2026-08-31\tскоро\tproduct\tпроба\tchat\tdocs/facts/open.tsv')"
  FACTS_OPEN="$registry" bash "$gate" 2>&1 |
  sed -n 's/.*срок «скоро» — //p' | tr ',' '\n' |
  sed -n 's/.*«\(.*\)».*/\1/p')
number=$((number + 1))
count=$(printf '%s\n' "$listed" | grep -c .)
if [ "$count" -lt 3 ]; then
  failures=$((failures + 1))
  printf '  ✗ сообщение перечисляет сроки (слов: %s, ждали не меньше 3)\n' "$count"
else
  bad=""
  while IFS= read -r word; do
    [ -n "$word" ] || continue
    probe "$(printf 'probe.listed\t2026-08-31\t%s\tproduct\tпроба\tchat\tdocs/facts/open.tsv' "$word")"
    FACTS_OPEN="$registry" bash "$gate" >/dev/null 2>&1 || bad="$bad «$word»"
  done <<< "$listed"
  if [ -n "$bad" ]; then
    failures=$((failures + 1))
    printf '  ✗ перечисленный срок отвергается гейтом:%s\n' "$bad"
  else
    printf '  ✓ каждый срок из сообщения принимается гейтом (слов: %s)\n' "$count"
  fi
fi

# «с запуском» — четвёртый вид срока, заведён 03.09.2026. Он нужен потому, что
# двух клеток не хватало: у пункта «пункт „пожаловаться“ в меню сообщения»
# обязательство настоящее и вес legal, а исполнить его не на чем — ни ленты, ни
# офферов, ни сообщений в схеме узла нет. «сейчас» делало его вечно горящим,
# «-» запрещён для legal. Обе половины случая проверяются: значение принимается,
# и оно по-прежнему не открывает legal-пункту дорогу к «-».
probe "$(printf 'probe.launch\t2026-08-31\tс запуском\tlegal\tпроба\tdsa\tdocs/facts/open.tsv')"
expect 0 'форма, вес, область и срок на месте' 'срок «с запуском» принимается'

probe "$(printf 'probe.launch.notdash\t2026-08-31\t-\tlegal\tпроба\tdsa\tdocs/facts/open.tsv')"
expect 1 'без срока' '«с запуском» не отменяет запрета «-» для legal'

# Адрес — «файл:строка», и номер тоже проверяется. Пункт open.where.line завёл
# это 01.09.2026, закрыто 03.09.2026: до того ворота смотрели только на файл,
# и два адреса из тридцати одного вели не туда — brand.scope.snapshot на колонку
# `lat`, identity.sweeper на пустую строку. Три случая на три способа соврать
# номером: за концом файла, на пустой строке и не числом вовсе.
probe "$(printf 'probe.line.past\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/facts/open.tsv:99999')"
expect 1 'а в файле их' 'номер строки за концом файла'

# Номер пустой строки не вписывается сюда числом: он бы разъехался при первой
# правке документа — то есть случай страдал бы ровно тем дефектом, который
# проверяет. Поэтому пустая строка ищется в живом документе на месте.
blank_file="docs/chat_RU.md"
blank_line=$(grep -n '^[[:space:]]*$' "$root/$blank_file" | head -1 | cut -d: -f1)
if [ -z "$blank_line" ]; then
  failures=$((failures + 1)); number=$((number + 1))
  printf '  ✗ в %s не нашлось пустой строки — случай не на чем построить\n' "$blank_file"
else
  probe "$(printf 'probe.line.blank\t2026-08-31\t-\tproduct\tпроба\tchat\t%s:%s' \
    "$blank_file" "$blank_line")"
  expect 1 'ведёт на пустую строку' 'номер строки указывает на пустую'
fi

probe "$(printf 'probe.line.nan\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/facts/open.tsv:где-то')"
expect 1 'после двоеточия не номер строки' 'вместо номера строки слово'

# Обратная сторона: адрес без номера законен и не должен краснеть — на него
# опираются пункты, указывающие на реестр целиком (docs/facts/schema.tsv).
probe "$(printf 'probe.line.none\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/facts/open.tsv')"
expect 0 'форма, вес, область и срок на месте' 'адрес без номера строки законен'

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
