#!/usr/bin/env bash
# Реестр открытых вопросов: форма, вес, область и срок.
#
#   scripts/check-facts-open.sh
#
# Пока все пункты равны между собой, выбор «что делать дальше» делается по тому,
# что первым попалось на глаза: уборщик личностей, которого требует обещание в
# документе о приватности, стоит в списке рядом с текстами в мокапах. Вес это
# разделяет, и потому он обязателен — как и область, взятая из объявленного
# словаря, а не придуманная строкой.
#
# Срок у обещания из юридических документов не бывает «-». Он либо в будущем,
# либо «сейчас»: обязательство действует, исполнения нет, и это не отсутствие
# срока, а истёкший срок.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
group="$(cd "$root/.." && pwd)"
registry="${FACTS_OPEN:-$root/docs/facts/open.tsv}"
config="${FACTS_ONTOLOGY:-$root/docs/facts/ontology.json}"

[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }
[ -f "$config" ] || { echo "нет конфига: $config" >&2; exit 2; }

areas=$(python3 -c "
import json, sys
data = json.load(open('$config'))
print('\n'.join(data.get('open_areas', {})))")
weights=$(python3 -c "
import json, sys
data = json.load(open('$config'))
print('\n'.join(data.get('open_weights', {})))")
[ -n "$areas" ] || { echo "в конфиге не объявлено ни одной области" >&2; exit 2; }

problems=0; checked=0; seen=""
declare -A by_weight

while IFS=$'\t' read -r id opened due weight what blocks where; do
  case "$id" in ''|'#'*|id) continue ;; esac
  checked=$((checked + 1))

  case " $seen " in *" $id "*)
    printf '  ✗ %s: такой id уже есть в реестре\n' "$id"; problems=$((problems + 1)) ;;
  esac
  seen="$seen $id"

  if ! printf '%s\n' "$weights" | grep -qx "$weight"; then
    printf '  ✗ %s: вес «%s» вне объявленных (%s)\n' "$id" "$weight" \
      "$(printf '%s' "$weights" | tr '\n' ' ')"
    problems=$((problems + 1))
  else
    by_weight[$weight]=$(( ${by_weight[$weight]:-0} + 1 ))
  fi

  if ! printf '%s\n' "$areas" | grep -qx "$blocks"; then
    printf '  ✗ %s: область «%s» не объявлена в ontology.json\n' "$id" "$blocks"
    problems=$((problems + 1))
  fi

  case "$due" in
    -|сейчас|20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]) ;;
    *) printf '  ✗ %s: срок «%s» — не дата, не «сейчас» и не «-»\n' "$id" "$due"
       problems=$((problems + 1)) ;;
  esac

  if [ "$weight" = legal ] && [ "$due" = '-' ]; then
    printf '  ✗ %s: обещание из юридических документов без срока\n' "$id"
    printf '      либо дата, либо «сейчас» — обязательство уже действует\n'
    problems=$((problems + 1))
  fi

  file="${where%%:*}"
  # Реестр может ссылаться и на себя подобных: docs/facts/schema.tsv держит счёт
  # непроведённых таблиц, и это законный адрес.
  if [ ! -f "$root/$file" ] && [ ! -f "$group/$file" ]; then
    printf '  ✗ %s: адрес указывает на файл, которого нет — %s\n' "$id" "$file"
    problems=$((problems + 1))
  fi
done < "$registry"

summary=""
for weight in $weights; do
  summary="$summary${summary:+, }$weight ${by_weight[$weight]:-0}"
done

if [ "$problems" -gt 0 ]; then
  printf '\nпунктов: %s (%s) — РАСХОЖДЕНИЙ: %s\n' "$checked" "$summary" "$problems"
  exit 1
fi
printf '\nпунктов: %s (%s) — форма, вес, область и срок на месте\n' "$checked" "$summary"
exit 0
