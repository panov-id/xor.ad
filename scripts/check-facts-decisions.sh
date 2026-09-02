#!/usr/bin/env bash
# Реестр решений против обеих языковых половин.
#
#   scripts/check-facts-decisions.sh
#
# Для каждой строки реестра: предмет решения обязан найтись в своей половине, и
# дата на найденной строке обязана совпасть с датой реестра — в русской половине
# как ДД.ММ.ГГГГ, в английской как ГГГГ-ММ-ДД.
#
# Почему именно так. 31.08.2026 русская половина спеки чата говорила «с
# 28.08.2026 у реплики есть цель уведомления», английская — «since 2026-08-26».
# Ни проверка парности (она считает структуру и числа множествами), ни сравнение
# множеств дат по файлу этого не видели: обе даты и так встречались в каждой
# половине по другим поводам. Ловит только сверка одного решения в двух местах.
#
# Якорь — текст предмета, а не номер строки: номер сдвигает любая вставка выше,
# и реестр на номерах краснел бы от каждой правки, ничего не проверяя.
#
# Коды выхода: 0 — сверено и сошлось; 1 — расхождение; 3 — сверять было нечего,
# в реестре ноль записей. Тот же код, что в check-facts-open.sh и
# check-node-images.sh: «нечего проверять» обязано читаться одинаково во всех
# воротах, иначе вызывающий разбирает каждые ворота отдельно и однажды не станет.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
group="$(cd "$here/../.." && pwd)"
registry="${FACTS_DECISIONS:-$here/../docs/facts/decisions.tsv}"

[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }
problems=0
checked=0

# Дату пишут не только цифрами. «Следующая проверка — до 5 августа 2027» и «Next
# check — by 5 August 2027» это одно решение в двух половинах, но первая версия
# требовала ДД.ММ.ГГГГ и ISO и такую пару в реестр не пускала: предмет находился,
# а даты «на его строке не было». Проверено 31.08.2026 попыткой завести её —
# скрипт дал две ложные находки на ровном месте.
MONTHS_RU=(января февраля марта апреля мая июня июля августа сентября октября ноября декабря)
MONTHS_EN=(January February March April May June July August September October November December)
MONTHS_EN_SHORT=(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec)

# Любая запись даты — этим ищется строка, на которой решение вообще датировано.
ANY_DATE='[0-9]{2}\.[0-9]{2}\.20[0-9]{2}|20[0-9]{2}-[0-9]{2}-[0-9]{2}'
ANY_DATE="$ANY_DATE|[0-9]{1,2} ($(IFS='|'; echo "${MONTHS_RU[*]}")) 20[0-9]{2}"
ANY_DATE="$ANY_DATE|[0-9]{1,2} ($(IFS='|'; echo "${MONTHS_EN[*]}|${MONTHS_EN_SHORT[*]}"))\.? 20[0-9]{2}"
ANY_DATE="$ANY_DATE|($(IFS='|'; echo "${MONTHS_EN[*]}|${MONTHS_EN_SHORT[*]}"))\.? [0-9]{1,2},? 20[0-9]{2}"

date_forms() {  # date_forms RU|EN <год> <месяц> <день> — все записи одной даты
  local half="$1" year="$2" month="$3" day="$4"
  local bare=$((10#$day)) index=$((10#$month - 1))
  if [ "$half" = RU ]; then
    printf '%s\.%s\.%s|%s %s %s' "$day" "$month" "$year" "$bare" "${MONTHS_RU[$index]}" "$year"
  else
    printf '%s-%s-%s|%s (%s|%s)\.? %s|(%s|%s)\.? %s,? %s' \
      "$year" "$month" "$day" "$bare" "${MONTHS_EN[$index]}" "${MONTHS_EN_SHORT[$index]}" "$year" \
      "${MONTHS_EN[$index]}" "${MONTHS_EN_SHORT[$index]}" "$bare" "$year"
  fi
}

while IFS=$'\t' read -r id date ru en subject_ru subject_en; do
  case "$id" in ''|'#'*|id) continue ;; esac
  ru_file="$group/${ru%%:*}"; en_file="$group/${en%%:*}"
  year=${date%%-*}; rest=${date#*-}; month=${rest%%-*}; day=${rest##*-}

  human() {  # human RU|EN — как эта дата читается человеком, для сообщения
    local index=$((10#$month - 1))
    if [ "$1" = RU ]; then printf '%s.%s.%s (%s %s %s)' "$day" "$month" "$year" \
      "$((10#$day))" "${MONTHS_RU[$index]}" "$year"
    else printf '%s-%s-%s (%s %s %s)' "$year" "$month" "$day" \
      "$((10#$day))" "${MONTHS_EN[$index]}" "$year"; fi
  }

  check_half() {  # check_half <файл> <предмет> <регулярка даты> <метка> <дата словами>
    local file="$1" subject="$2" wanted="$3" label="$4" readable="$5"
    checked=$((checked + 1))
    if [ ! -f "$file" ]; then
      printf '  ✗ %s: нет файла %s\n' "$id" "$file"; problems=$((problems + 1)); return
    fi
    # Один и тот же предмет может стоять в документе дважды — в оглавлении и в
    # разборе. Берём ту строку, где предмет соседствует с датой; если такой нет,
    # это само по себе находка, а не повод молча взять первую попавшуюся.
    local line
    line=$(grep -nF -- "$subject" "$file" | grep -E "$ANY_DATE" | head -1)
    if [ -z "$line" ] && grep -qF -- "$subject" "$file"; then
      printf '  ✗ %s (%s): предмет есть, а даты на его строке нет — «%s»\n' "$id" "$label" "$subject"
      problems=$((problems + 1)); return
    fi
    if [ -z "$line" ]; then
      printf '  ✗ %s (%s): предмет решения не найден — «%s»\n' "$id" "$label" "$subject"
      printf '      переименован или удалён: обнови реестр или верни формулировку\n'
      problems=$((problems + 1)); return
    fi
    if ! printf '%s' "$line" | grep -qE -- "$wanted"; then
      printf '  ✗ %s (%s): дата разошлась с реестром\n' "$id" "$label"
      printf '      реестр говорит %s, а строка %s содержит: %s\n' \
        "$readable" "${line%%:*}" "$(printf '%s' "$line" | grep -oE "$ANY_DATE" | tr '\n' ' ')"
      problems=$((problems + 1))
    fi
  }

  check_half "$ru_file" "$subject_ru" "$(date_forms RU "$year" "$month" "$day")" RU "$(human RU)"
  check_half "$en_file" "$subject_en" "$(date_forms EN "$year" "$month" "$day")" EN "$(human EN)"
done < "$registry"

if [ "$problems" -gt 0 ]; then
  printf '\nрешений сверено: %s (по двум половинам) — РАСХОЖДЕНИЙ: %s\n' "$((checked / 2))" "$problems"
  exit 1
fi
if [ "$checked" = 0 ]; then
  # Ноль сверенных решений — не «даты сходятся везде», а «дат не было». Разница
  # в том, кто это читает: человек видит ноль в строке, вызывающий скрипт — код.
  printf '\nв реестре ни одной записи — проверять было нечего, это не зелёный результат\n'
  exit 3
fi
printf '\nрешений сверено: %s (по двум половинам) — даты сходятся везде\n' "$((checked / 2))"
exit 0
