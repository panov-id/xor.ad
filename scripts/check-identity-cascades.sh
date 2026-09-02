#!/usr/bin/env bash
# Каждая ссылка на identities в спеке чата обязана назвать ON DELETE.
#
#   scripts/check-identity-cascades.sh
#
# Зачем. 31.08.2026 решение о поведении внешнего ключа было принято для стола и
# записано, а шесть колонок постарше остались без ON DELETE — их поймала панель
# ревью 02.09.2026, через два дня после решения. Поймала глазами: ни одни ворота
# на DDL спеки не смотрели. Пропущенный ON DELETE не виден при чтении — Postgres
# молча ставит NO ACTION, — и обнаруживается в день, когда впервые пробуют
# удалить личность, то есть в день, когда обещание «необратимое стирание»
# должно исполниться.
#
# Правило проверяется одно и механическое: строка DDL со словами
# REFERENCES identities(id) несёт ON DELETE. Какое именно — SET NULL или
# CASCADE — решает человек по §8: улика теряет автора, личное уходит с ним.
#
# Коды выхода: 0 — все ссылки названы; 1 — есть ссылка без ON DELETE;
# 3 — сверять было нечего (ни одной ссылки не нашлось: значит переименовали
# таблицу или сломали путь, и молчаливый ноль был бы враньём).
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bad=0; total=0

for doc in docs/chat_RU.md docs/chat_EN.md; do
  path="$root/$doc"
  [ -f "$path" ] || { echo "нет документа: $doc"; exit 3; }
  while IFS=: read -r num line; do
    [ -n "$num" ] || continue
    total=$((total + 1))
    case "$line" in
      *"ON DELETE"*) ;;
      *) bad=$((bad + 1))
         printf '  ✗ %s:%s\n      %s\n' "$doc" "$num" "$(printf '%s' "$line" | sed 's/^ *//')"
         printf '      ссылка на identities без ON DELETE — Postgres поставит NO ACTION молча\n' ;;
    esac
  done < <(grep -n 'REFERENCES identities(id)' "$path")
done

if [ "$total" = 0 ]; then
  echo "ни одной ссылки на identities не найдено — проверять нечего"
  exit 3
fi

if [ "$bad" -gt 0 ]; then
  echo "ссылок на identities: $total — БЕЗ ON DELETE: $bad"
  exit 1
fi
echo "ссылок на identities: $total — у каждой названо ON DELETE"
