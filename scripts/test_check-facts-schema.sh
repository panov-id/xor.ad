#!/usr/bin/env bash
# Проверка проверки схемы: каждое расхождение, которое она обязана видеть,
# здесь создаётся в живой базе и обязано покраснеть.
#
#   scripts/test_check-facts-schema.sh
#
# Зачем именно на живой базе. Проверка переехала с грепа по тексту миграции на
# запрос к базе ровно потому, что текст и база расходятся молча. Проба, которая
# ломала бы текст, проверяла бы прежнюю версию, а не эту.
#
# Всё ломается обратимо: таблица переименовывается и возвращается, лишняя
# создаётся и удаляется, реестр правится в копии и восстанавливается.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
compose="$root/relay/local/docker-compose.yml"
gate="$here/check-facts-schema.sh"
registry="$root/docs/facts/schema.tsv"

sql() { docker compose -f "$compose" exec -T postgres psql -U relay -d relay -tAc "$1" >/dev/null 2>&1; }

if ! sql 'select 1'; then
  echo "базы нет — поднять: docker compose -f relay/local/docker-compose.yml up -d postgres" >&2
  exit 2
fi

backup=$(mktemp); cp "$registry" "$backup"
restore() { cp "$backup" "$registry"; rm -f "$backup" "$root/relay/node/db/999_probe.sql"; }
trap restore EXIT

failures=0; number=0

expect() {  # expect <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(bash "$gate" 2>&1); local code=$?
  if printf '%s' "$output" | grep -qF -- "$1" && [ "$code" = 1 ]; then
    printf '  ✓ %s\n' "$2"
  else
    failures=$((failures + 1))
    printf '  ✗ %s (код %s)\n' "$2" "$code"
    printf '%s\n' "$output" | sed 's/^/      | /' | head -6
  fi
}

echo "СЛУЧАИ"

sql 'alter table jobs rename to jobs_probe'
expect 'база её не знает' 'таблица из реестра пропала из базы'
sql 'alter table jobs_probe rename to jobs'

sql 'create table probe_orphan (id int)'
expect 'живёт в базе и не заведена в реестре' 'лишняя таблица в базе'
sql 'drop table probe_orphan'

sed -i 's|^blocks\t\(.*\)\t-\tproduct|blocks\t\1\trelay/node/db/001_control_state.sql\tproduct|' "$registry"
expect 'база её не знает' 'реестр пообещал базе продуктовую таблицу'
cp "$backup" "$registry"

printf -- '-- проба: файл, которого стенд ещё не применял\nCREATE TABLE IF NOT EXISTS probe_pending (id int);\n' \
  > "$root/relay/node/db/999_probe.sql"
expect 'стенд отстал от репозитория' 'на диске миграций больше, чем применено'
rm -f "$root/relay/node/db/999_probe.sql"

# Состояние «продукт на бумаге» обязано быть датировано, и число в записи —
# сверяться с явью, иначе запись переживёт своё содержание.
open_items="$root/docs/facts/open.tsv"
backup_open=$(mktemp); cp "$open_items" "$backup_open"
grep -v '^product.tables.unmigrated' "$backup_open" > "$open_items"
expect 'записи product.tables.unmigrated в open.tsv нет' 'непроведённые таблицы без датированной записи'
sed 's/^product.tables.unmigrated\t\([^\t]*\)\t\([^\t]*\)\t18 /product.tables.unmigrated\t\1\t\2\t7 /' \
  "$backup_open" > "$open_items"
expect 'записано другое число таблиц продукта' 'число в записи разошлось с явью'
cp "$backup_open" "$open_items"; rm -f "$backup_open"

number=$((number + 1))
output=$(FACTS_COMPOSE=/nonexistent/compose.yml bash "$gate" 2>&1); code=$?
if [ "$code" = 2 ] && printf '%s' "$output" | grep -q 'зелёным это назвать нельзя'; then
  printf '  ✓ без базы проверка отказывается, а не зеленеет\n'
else
  failures=$((failures + 1)); printf '  ✗ без базы: код %s\n' "$code"
fi

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1; fi
printf 'случаев: %s — каждое расхождение видно\n' "$number"
