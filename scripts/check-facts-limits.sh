#!/usr/bin/env bash
# Реестр пределов против документов — в обе стороны.
#
#   scripts/check-facts-limits.sh
#
# Сторона первая: каждое значение из docs/facts/limits.tsv обязано найтись в
# каждом файле, который строка называет. Это ловит расхождение одного решения по
# нескольким файлам и репозиториям — случай 31.08.2026, когда радиус стал пятью
# ступенями в гейте, а витрины остались с диапазоном.
#
# Сторона вторая: каждая строка таблицы «Пределы» в protocol_{RU,EN}.md обязана
# иметь строку в реестре. Это ловит предел, заведённый мимо реестра, — иначе
# реестр тихо устареет и станет украшением.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
group="$(cd "$root/.." && pwd)"
registry="${FACTS_LIMITS:-$root/docs/facts/limits.tsv}"
protocol_ru="${FACTS_PROTOCOL_RU:-$root/docs/protocol_RU.md}"

[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }
problems=0
checked=0

# --- сторона первая: реестр → документы -------------------------------------
while IFS=$'\t' read -r id values unit what enforced places; do
  case "$id" in ''|'#'*|id) continue ;; esac
  IFS=',' read -ra files <<< "$places"
  for file in "${files[@]}"; do
    path="$group/$file"
    if [ ! -f "$path" ]; then
      printf '  ✗ %s: файла нет — %s\n' "$id" "$file"
      problems=$((problems + 1)); continue
    fi
    for value in $values; do
      # Нечисловое отсеивается до всякой арифметики. Ниже стоит $((value % 1000)),
      # а bash вычисляет содержимое переменной как выражение: значение вида
      # q[$(команда)] в этом месте выполняет команду. Проверено экспериментом
      # 31.08.2026 — ворота, запускаемые перед каждым докладом, исполняли данные
      # из реестра. Реестр пишет тот же, кто пишет код, поэтому это не дыра в
      # периметре; это ворота, которым нельзя доверять собственный вход.
      case "$value" in
        ''|*[!0-9.]*)
          printf '  ✗ %s: значение «%s» не число — реестр держит числа\n' "$id" "$value"
          problems=$((problems + 1)); continue ;;
      esac
      checked=$((checked + 1))
      # Число как отдельный токен: «100» не должно ловиться внутри «10000».
      # Запятая соседом разрешена: в перечислении «100, 300, 1000» она разделитель,
      # а не десятичный знак. Первая версия этого условия запятую исключала и
      # объявила пропавшими все пять ступеней там, где они стояли.
      pattern="(^|[^0-9.])$value([^0-9.]|\$)"
      # Метры пишут километрами там, где так читается лучше: «1 км» в композере
      # витрины — не расхождение, а язык. Поэтому для метров принимаем обе записи.
      if [ "$unit" = "метров" ] && [ $((value % 1000)) -eq 0 ] && [ "$value" -ge 1000 ]; then
        pattern="$pattern|(^|[^0-9.])$((value / 1000)) ?(км|km)"
      fi
      if ! grep -qE "$pattern" "$path"; then
        printf '  ✗ %s: значение %s %s не найдено в %s\n' "$id" "$value" "$unit" "$file"
        printf '      %s — держит %s\n' "$what" "$enforced"
        problems=$((problems + 1))
      fi
    done
  done
done < "$registry"

# --- сторона вторая: таблица пределов → реестр -------------------------------
# Строки таблицы «Пределы» протокола. Числа из строки должны найтись в реестре;
# строка без единого числа — описательная (например «до узла сетки с шагом в
# радиус фразы»), и её мы пропускаем осознанно.
table_rows=0
while IFS= read -r row; do
  numbers=$(printf '%s' "$row" | grep -oE '\b[0-9]+\b' | sort -u)
  [ -n "$numbers" ] || continue
  table_rows=$((table_rows + 1))
  for number in $numbers; do
    if ! grep -v '^#' "$registry" | cut -f2 | grep -qE "(^| )$number( |$)"; then
      printf '  ✗ предел из таблицы протокола не заведён в реестре: %s (число %s)\n' \
        "$(printf '%s' "$row" | cut -d'|' -f2 | sed 's/^ *//;s/ *$//')" "$number"
      problems=$((problems + 1))
    fi
  done
done < <(awk '/^## 5\. Пределы/,/^\*\*/' "$protocol_ru" | grep '^| ' | grep -v '^| Что' | grep -v '^|---')

if [ "$problems" -gt 0 ]; then
  printf '\nсверок сделано: %s, строк таблицы протокола: %s — РАСХОЖДЕНИЙ: %s\n' \
    "$checked" "$table_rows" "$problems"
  exit 1
fi
printf '\nсверок сделано: %s, строк таблицы протокола: %s — числа сходятся везде\n' \
  "$checked" "$table_rows"
exit 0
