#!/usr/bin/env bash
# Переадресатор: правит только то, что опознано, и отказывается от остального.
#
#   scripts/test_readdress-facts.sh
#
# Скрипт, который переписывает номера строк в реестрах, опаснее ворот: ворота в
# худшем случае молчат, а этот в худшем случае впишет неверный адрес и сделает
# ворота зелёными поверх расхождения. Поэтому проверяется не только «чинит», но
# и «отказывается»: якорь не найден, якорь неуникален, якоря нет вовсе.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
tool="$here/readdress-facts.py"

# Живые реестры только читаются: скрипт умеет брать путь из окружения, значит
# копии достаточно и восстанавливать после теста нечего.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
open_witness="$work/каким-был-open.tsv"
schema_witness="$work/каким-был-schema.tsv"
cp "$root/docs/facts/open.tsv" "$open_witness" || { echo "не снялся open.tsv" >&2; exit 2; }
cp "$root/docs/facts/schema.tsv" "$schema_witness" || { echo "не снялся schema.tsv" >&2; exit 2; }

open="$work/open.tsv"; schema="$work/schema.tsv"
reset() { cp "$open_witness" "$open"; cp "$schema_witness" "$schema"; }
run() { FACTS_OPEN="$open" FACTS_SCHEMA="$schema" python3 "$tool" "$@" 2>&1; }

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание> [аргументы скрипта...]
  number=$((number + 1))
  local code_wanted="$1" needle="$2" what="$3"; shift 3
  local output; output=$(run "$@"); local code=$?
  if [ "$code" = "$code_wanted" ] && printf '%s' "$output" | grep -qF -- "$needle"; then
    printf '  ✓ %s\n' "$what"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$what" "$code" "$code_wanted"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}

# Строка реестра, которую можно испортить: первая с адресом вида файл:номер.
first_open_row=$(grep -v '^#' "$open_witness" | awk -F'\t' 'NR>1 && $7 ~ /:[0-9]+$/ {print; exit}')
first_schema_row=$(grep -v '^#' "$schema_witness" | awk -F'\t' 'NR>1 && $2 ~ /:[0-9]+$/ {print; exit}')
[ -n "$first_open_row" ] && [ -n "$first_schema_row" ] || {
  echo "в реестрах не нашлось строки с номером — проверять нечего" >&2; exit 2; }

echo "СЛУЧАИ"

reset
expect 0 'переадресовывать нечего' 'нынешние реестры переадресовывать не надо'

# Сбитый номер при живом якоре — ровно то, ради чего скрипт написан.
reset
id=$(printf '%s' "$first_open_row" | cut -f1)
python3 - "$open" "$id" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        rel, number = cells[6].rsplit(":", 1)
        cells[6] = f"{rel}:{int(number) + 40}"
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
# Сухой прогон — ворота: найденный дрейф обязан быть красным, иначе check-all
# промолчит ровно о том, ради чего скрипт туда поставлен.
expect 1 "$id" 'сбитый номер при живом якоре — назван и красен'
before=$(grep -c . "$open")
run --write >/dev/null
after=$(grep -c . "$open")
number=$((number + 1))
if [ "$before" = "$after" ] && FACTS_OPEN="$open" FACTS_SCHEMA="$schema" python3 "$tool" | grep -q 'переадресовывать нечего'; then
  printf '  ✓ --write чинит и не теряет строк (%s строк до и после)\n' "$before"
else
  failures=$((failures + 1)); printf '  ✗ --write чинит и не теряет строк (%s → %s)\n' "$before" "$after"
fi

# Якорь, которого в файле нет: номер тут не поможет — только руки.
reset
python3 - "$open" "$id" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        cells[7] = "такой строки в документе нет и не было"
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
expect 1 'чинить руками' 'якорь не найден — отказ, а не догадка'

# Неуникальный якорь: скрипт обязан отказаться, а не взять первое совпадение.
reset
python3 - "$open" "$id" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        cells[7] = " "
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
expect 1 'адрес неоднозначен' 'неуникальный якорь — отказ'

# Адрес с номером и без якоря — то же нарушение, что ловят ворота.
reset
python3 - "$open" "$id" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        cells[7] = ""
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
expect 1 'якоря нет' 'номер без якоря — отказ'

# Схема опознаётся по имени таблицы: сбитый номер чинится, битое имя отказывается.
reset
table=$(printf '%s' "$first_schema_row" | cut -f1)
python3 - "$schema" "$table" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        rel, number = cells[1].rsplit(":", 1)
        cells[1] = f"{rel}:{int(number) + 40}"
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
expect 1 "$table" 'сбитый номер в схеме — назван по имени таблицы'

reset
python3 - "$schema" "$table" <<'PY'
import sys
path, wanted = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if line.split("\t")[0] == wanted:
        cells = line.rstrip("\n").split("\t")
        cells[0] = "no_such_table_anywhere"
        lines[i] = "\t".join(cells) + "\n"
        break
open(path, "w", encoding="utf-8").write("".join(lines))
PY
expect 1 'no_such_table_anywhere' 'таблицы нет в документе — отказ'

# Живой реестр не тронут: скрипт работал по копиям.
number=$((number + 1))
if cmp -s "$open_witness" "$root/docs/facts/open.tsv" && cmp -s "$schema_witness" "$root/docs/facts/schema.tsv"; then
  printf '  ✓ живые реестры не тронуты\n'
else
  failures=$((failures + 1)); printf '  ✗ живые реестры изменились — тест писал не туда\n'
fi

printf '\nслучаев: %s, провалено: %s\n' "$number" "$failures"
[ "$failures" = 0 ]
