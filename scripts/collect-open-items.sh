#!/usr/bin/env bash
# Собрать открытые пункты из всех источников в один список.
#
#   scripts/collect-open-items.sh [--tsv]
#
# Их сегодня пять сортов и они не знают друг о друге: незакрытые чекбоксы в
# сводном чеклисте, в чеклисте DSA и в чеклисте ревью; абзацы «Открытый пункт» в
# спеке чата; раздел «Открыто» в дизайн-системе. Из-за этого «что открыто»
# приходилось собирать глазами по шести файлам, и часть терялась.
#
# Скрипт ничего не решает: он показывает, что где лежит. Реестр docs/facts/open.tsv
# ведётся руками поверх этого вывода — в него идёт то, что действительно ждёт
# решения, а не каждая незакрытая галочка.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
tsv=0; [ "${1:-}" = --tsv ] && tsv=1

emit() {  # emit <источник> <файл> <строка> <текст>
  if [ "$tsv" = 1 ]; then printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"
  else printf '  %-14s %s:%s\n      %s\n' "$1" "$2" "$3" "$4"; fi
}

[ "$tsv" = 1 ] && printf 'source\tfile\tline\ttext\n'
# The registry itself, since 2026-09-26: open-work is retired into docs/archive/,
# and what it used to hold as checkboxes lives here one row per item.
while IFS=$'\t' read -r number id what; do
  emit "реестр" "docs/facts/open.tsv" "$number" "$id — $(printf '%s' "$what" | cut -c1-110)"
done < <(awk -F'\t' '!/^#/ && $1 != "id" {print FNR"\t"$1"\t"$5}' "$root/docs/facts/open.tsv")
for file in docs/dsa/CHECKLIST_RU.md docs/review-checklist_RU.md; do
  [ -f "$root/$file" ] || continue
  while IFS=: read -r number text; do
    emit "чекбокс" "$file" "$number" "$(printf '%s' "$text" | sed 's/^- \[ \] //' | cut -c1-120)"
  done < <(grep -n '^- \[ \]' "$root/$file")
done
while IFS=: read -r number text; do
  emit "спека-чата" "docs/chat_RU.md" "$number" "$(printf '%s' "$text" | sed 's/^ *- *//' | cut -c1-120)"
done < <(grep -n 'Открытый пункт\|открытым пунктом\|Уборщика ещё нет' "$root/docs/chat_RU.md")
while IFS=: read -r number text; do
  emit "дизайн" "docs/design-system-app_RU.md" "$number" "$(printf '%s' "$text" | sed 's/^- *//' | cut -c1-120)"
done < <(awk 'f&&/^- \*\*/{print FNR":"$0} /^## Открыто/{f=1}' "$root/docs/design-system-app_RU.md")
