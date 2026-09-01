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
registry="$root/docs/facts/open.tsv"

backup=$(mktemp); cp "$registry" "$backup"
trap 'cp "$backup" "$registry"; rm -f "$backup"' EXIT

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
probe() { cp "$backup" "$registry"; printf '%s\n' "$1" >> "$registry"; }

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

probe "$(printf 'G11\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/facts/open.tsv')"
expect 1 'такой id уже есть' 'повторный id'

probe "$(printf 'probe.where\t2026-08-31\t-\tproduct\tпроба\tchat\tdocs/no-such-file_RU.md:1')"
expect 1 'файл, которого нет' 'адрес в никуда'

cp "$backup" "$registry"
expect 0 'форма, вес, область и срок на месте' 'после проб реестр цел'

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1; fi
printf 'случаев: %s — каждое нарушение формы видно\n' "$number"
