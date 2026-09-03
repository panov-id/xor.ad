#!/usr/bin/env bash
# Реестр таблиц против живой базы, миграций и документов.
#
#   scripts/check-facts-schema.sh
#
# Реестр утверждает две разные вещи, и проверяются они по-разному:
#
#   declared_in  — таблица объявлена спекой. Это текст, и проверяется текстом.
#   migration    — таблица создаётся миграцией. Это обещание про базу, и
#                  проверяется у базы, а не грепом по тексту миграции.
#
# Прежняя версия оба утверждения проверяла грепом. 31.08.2026 это разошлось с
# явью на ровном месте: стенд крутил образ, собранный до седьмой миграции, и
# видел 4 файла из 11 — греп по диску говорил «таблица есть», база не знала о
# семи из них. Текст миграции и содержимое базы это разные вещи, и совпадают они
# только пока никто не смотрит.
#
# База нужна поднятая. Отсутствие базы — не повод для зелёного отчёта: скрипт
# выходит с кодом 2 и говорит, чем её поднять. Молчаливое «сходится» на пустом
# месте — худшее, что проверка может сделать.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
registry="${FACTS_SCHEMA:-$root/docs/facts/schema.tsv}"
compose="${FACTS_COMPOSE:-$root/relay/local/docker-compose.yml}"

[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }

# --- живая база --------------------------------------------------------------
live=$(docker compose -f "$compose" exec -T postgres \
         psql -U relay -d relay -tAc \
         "select table_name from information_schema.tables
           where table_schema='public' and table_type='BASE TABLE'" 2>/dev/null | tr -d '\r')
if [ -z "$live" ]; then
  cat >&2 <<MSG
базы нет или она пуста — проверять нечего, и зелёным это назвать нельзя.
поднять:  docker compose -f ${compose#$root/} up -d postgres
          docker compose -f ${compose#$root/} up migrate
MSG
  exit 2
fi
live_count=$(printf '%s\n' "$live" | grep -c .)

problems=0; checked=0; product=0; control=0; promised=0

in_base() { printf '%s\n' "$live" | grep -qx "$1"; }

while IFS=$'\t' read -r table declared migration layer; do
  case "$table" in ''|'#'*|table) continue ;; esac
  checked=$((checked + 1))
  [ "$layer" = product ] && product=$((product + 1)) || control=$((control + 1))

  # Объявление в документе — утверждение о тексте. Проверяется и файл, и номер
  # строки: до 03.09.2026 номер не сверялся ни с чем, и пятнадцать адресов из
  # восемнадцати вели мимо — все со смещением в 11-14 строк, то есть документ
  # рос выше, а реестр заполнили один раз и не трогали.
  #
  # Отдельной колонки-якоря здесь не нужно, в отличие от open.tsv: якорь
  # выводится из имени таблицы — строка `CREATE TABLE <имя>` уникальна в
  # документе по определению, и держать её копию в реестре значило бы дублировать
  # первую же колонку.
  if [ "$declared" != "-" ]; then
    file="${declared%%:*}"
    line="${declared##*:}"
    found=$(grep -nE "CREATE TABLE (IF NOT EXISTS )?$table\b" "$root/$file" 2>/dev/null | cut -d: -f1)
    hits=$(printf '%s' "$found" | grep -c .)
    if [ "$hits" = 0 ]; then
      printf '  ✗ %s: реестр обещает объявление в %s, а его там нет\n' "$table" "$file"
      problems=$((problems + 1))
    elif [ "$hits" -gt 1 ]; then
      printf '  ✗ %s: объявлений в %s несколько (%s) — адрес неоднозначен\n' \
        "$table" "$file" "$(printf '%s' "$found" | tr '\n' ' ')"
      problems=$((problems + 1))
    elif [ "$line" != "$declared" ] && [ "$found" != "$line" ]; then
      printf '  ✗ %s: адрес говорит строка %s, а объявление на %s — %s\n' \
        "$table" "$line" "$found" "$file"
      problems=$((problems + 1))
    fi
  fi

  # Миграция — утверждение о базе. Спрашиваем базу; текст миграции проверяем
  # заодно, потому что расхождение файла с базой это отдельная находка.
  if [ "$migration" != "-" ]; then
    promised=$((promised + 1))
    if ! grep -qE "CREATE TABLE (IF NOT EXISTS )?$table\b" "$root/$migration" 2>/dev/null; then
      printf '  ✗ %s: реестр обещает миграцию %s, а таблицы в ней нет\n' "$table" "$migration"
      problems=$((problems + 1))
    fi
    if ! in_base "$table"; then
      printf '  ✗ %s: реестр обещает таблицу в базе (%s), а база её не знает\n' \
        "$table" "$migration"
      printf '      миграции применены? docker compose -f %s up migrate\n' "${compose#$root/}"
      problems=$((problems + 1))
    fi
  elif in_base "$table"; then
    # Таблица без миграции, но в базе: реестр отстал от яви.
    printf '  ✗ %s: миграции в реестре нет, а в базе таблица есть\n' "$table"
    problems=$((problems + 1))
  fi
done < "$registry"

# Обратная сторона: всё, что есть в базе, обязано быть в реестре.
while read -r table; do
  [ -n "$table" ] || continue
  if ! grep -v '^#' "$registry" | cut -f1 | grep -qx "$table"; then
    printf '  ✗ таблица %s живёт в базе и не заведена в реестре\n' "$table"
    problems=$((problems + 1))
  fi
done <<< "$live"

# Таблицы продукта без миграции — состояние, а не недосмотр: продукт не начат.
# Восемнадцать сроков были бы восемнадцатью выдумками, поэтому требуется одна
# датированная запись в open.tsv, и число в ней сверяется с явью. Пока запись
# есть и число верно, «продукт на бумаге» — объявленное состояние; как только
# число разойдётся, запись устарела и это находка.
unmigrated=$(grep -v '^#' "$registry" | awk -F'\t' '$4=="product" && $3=="-"' | wc -l)
if [ "$unmigrated" -gt 0 ]; then
  open_items="${FACTS_OPEN:-$root/docs/facts/open.tsv}"
  entry=$(grep -v '^#' "$open_items" 2>/dev/null | awk -F'\t' '$1=="product.tables.unmigrated"')
  if [ -z "$entry" ]; then
    printf '  ✗ таблиц продукта без миграции %s, а записи product.tables.unmigrated в open.tsv нет\n' \
      "$unmigrated"
    printf '      состояние «продукт на бумаге» обязано быть датировано, а не подразумеваться\n'
    problems=$((problems + 1))
  elif ! printf '%s' "$entry" | grep -qE "(^|[^0-9])$unmigrated([^0-9]|\$)"; then
    printf '  ✗ в open.tsv записано другое число таблиц продукта, а их сейчас %s\n' "$unmigrated"
    printf '      %s\n' "$(printf '%s' "$entry" | cut -f4)"
    problems=$((problems + 1))
  fi
fi

# Миграции на диске против применённых: образ стенда может отстать от репозитория,
# и тогда база «сходится» с реестром только потому, что о новых таблицах не знает.
on_disk=$(ls "$root"/relay/node/db/*.sql 2>/dev/null | grep -c .)
applied=$(docker compose -f "$compose" exec -T postgres \
            psql -U relay -d relay -tAc 'select count(*) from schema_migrations' 2>/dev/null | tr -d ' \r')
if [ -n "$applied" ] && [ "$on_disk" != "$applied" ]; then
  printf '  ✗ миграций на диске %s, применено %s — стенд отстал от репозитория\n' \
    "$on_disk" "$applied"
  printf '      пересобрать и применить: docker compose -f %s build migrate && docker compose -f %s up migrate\n' \
    "${compose#$root/}" "${compose#$root/}"
  problems=$((problems + 1))
fi

if [ "$problems" -gt 0 ]; then
  printf '\nв реестре %s (продукт %s, контур %s), в базе %s, обещано базе %s — РАСХОЖДЕНИЙ: %s\n' \
    "$checked" "$product" "$control" "$live_count" "$promised" "$problems"
  exit 1
fi
printf '\nв реестре %s (продукт %s, контур %s), в базе %s, обещано базе %s — сходится\n' \
  "$checked" "$product" "$control" "$live_count" "$promised"
exit 0
