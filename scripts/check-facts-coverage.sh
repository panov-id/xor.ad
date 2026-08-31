#!/usr/bin/env bash
# Покрытие: каждая дата, найденная разведкой, обязана быть решением или шумом.
#
#   scripts/check-facts-coverage.sh
#
# Реестр решений отвечает на вопрос «сходятся ли половины по этой дате». Он не
# отвечает на вопрос «а все ли даты мы вообще посмотрели» — и пока на второй
# вопрос никто не отвечает, реестр растёт до удобного размера и останавливается.
# 31.08.2026 счёт был таков: 42 уникальные даты в документах, 13 из них покрыты
# решениями. Остальные 29 не были ни решениями, ни шумом — они были никем.
#
# Дата покрыта, если она стоит в decisions.tsv либо объявлена в noise.tsv с
# причиной. Третьего не дано: непокрытая дата ничем не отличается от незамеченной.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
group="$(cd "$root/.." && pwd)"
decisions="${FACTS_DECISIONS:-$root/docs/facts/decisions.tsv}"
noise="${FACTS_NOISE:-$root/docs/facts/noise.tsv}"

for file in "$decisions" "$noise"; do
  [ -f "$file" ] || { echo "нет реестра: $file" >&2; exit 2; }
done

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
python3 "$here/extract-facts.py" --out "$work" >/dev/null 2>&1 || {
  echo "разведка не отработала — покрытие считать не по чему" >&2; exit 2; }
[ -s "$work/decisions.raw.tsv" ] || { echo "разведка не нашла ни одной даты" >&2; exit 2; }

covered_decisions=$(grep -v '^#' "$decisions" | cut -f2 | grep -E '^20[0-9]{2}-' | sort -u)
covered_noise=$(grep -v '^#' "$noise" | cut -f1 | grep -E '^20[0-9]{2}-' | sort -u)
all_dates=$(tail -n +2 "$work/decisions.raw.tsv" | cut -f1 | sort -u)

# Шум, который на деле уже решение: строка в обоих реестрах означает, что кто-то
# завёл решение и забыл убрать отговорку. Молчать об этом нельзя — отговорка
# переживёт решение и оправдает следующий пропуск.
both=$(comm -12 <(printf '%s\n' "$covered_decisions") <(printf '%s\n' "$covered_noise"))

problems=0; total=0; as_decision=0; as_noise=0
while read -r date; do
  [ -n "$date" ] || continue
  total=$((total + 1))
  if printf '%s\n' "$covered_decisions" | grep -qx "$date"; then
    as_decision=$((as_decision + 1)); continue
  fi
  if printf '%s\n' "$covered_noise" | grep -qx "$date"; then
    as_noise=$((as_noise + 1)); continue
  fi
  count=$(awk -F'\t' -v d="$date" '$1==d' "$work/decisions.raw.tsv" | wc -l)
  example=$(awk -F'\t' -v d="$date" '$1==d {print $3":"$4; exit}' "$work/decisions.raw.tsv")
  printf '  ✗ %s не покрыта: %s упоминаний, например %s\n' "$date" "$count" "$example"
  printf '      либо решение в decisions.tsv, либо строка в noise.tsv с причиной\n'
  problems=$((problems + 1))
done <<< "$all_dates"

while read -r date; do
  [ -n "$date" ] || continue
  printf '  ✗ %s стоит и в решениях, и в шуме — отговорка пережила решение\n' "$date"
  problems=$((problems + 1))
done <<< "$both"

# --- вторая половина: числа ---------------------------------------------------
# Пара «значение + единица» покрыта, если значение стоит пределом в limits.tsv с
# той же единицей, либо пара объявлена в noise-numbers.tsv с причиной. Единицы
# нормализуются: «символов» и «characters» — одна единица, и считать их порознь
# значило бы удваивать одно и то же число.
# Пары готовятся один раз: значение, нормализованная единица и адрес, где она
# встретилась. Без адреса, привязанного к паре, пример в сообщении подбирался по
# одному значению и указывал на «1 км» там, где речь шла о «1 минуте».
tail -n +2 "$work/numbers.raw.tsv" \
  | awk -F'\t' '{print $5"\t"$6"\t"$2":"$3}' \
  | python3 "$here/normalise-unit.py" --pairs-with-place > "$work/pairs.tsv"

limits="${FACTS_LIMITS:-$root/docs/facts/limits.tsv}"
numbers_noise="${FACTS_NOISE_NUMBERS:-$root/docs/facts/noise-numbers.tsv}"
[ -f "$limits" ] || { echo "нет реестра: $limits" >&2; exit 2; }
[ -f "$numbers_noise" ] || { echo "нет реестра: $numbers_noise" >&2; exit 2; }

pairs_total=0; as_limit=0; as_prose=0
while IFS=$'\t' read -r value unit; do
  [ -n "$value" ] || continue
  pairs_total=$((pairs_total + 1))
  if grep -v '^#' "$limits" | awk -F'\t' -v v="$value" -v u="$unit" '
       {n=split($2, values, " "); for (i = 1; i <= n; i++) if (values[i] == v) print $3}' \
     | python3 "$here/normalise-unit.py" | grep -qx "$unit"; then
    as_limit=$((as_limit + 1)); continue
  fi
  if grep -v '^#' "$numbers_noise" | awk -F'\t' -v v="$value" -v u="$unit" '$1==v && $2==u' \
     | grep -q .; then
    as_prose=$((as_prose + 1)); continue
  fi
  example=$(awk -F'\t' -v v="$value" -v u="$unit" '$1==v && $2==u {print $3; exit}' \
              "$work/pairs.tsv")
  printf '  ✗ %s %s не покрыто: ни предел, ни объявленный шум (например %s)\n' \
    "$value" "$unit" "$example"
  problems=$((problems + 1))
done < <(cut -f1,2 "$work/pairs.tsv" | sort -u)

# --- третья половина: открытые пункты ----------------------------------------
# Незакрытая галочка — это работа, которая где-то ведётся. Либо запись в open.tsv,
# либо объявление в noise-open.tsv, что файл ведёт свои пункты сам. И то и другое
# считается по числу: реестр, где записей меньше, чем галочек, покрывает молчанием.
open_registry="${FACTS_OPEN:-$root/docs/facts/open.tsv}"
open_noise="${FACTS_NOISE_OPEN:-$root/docs/facts/noise-open.tsv}"
[ -f "$open_registry" ] || { echo "нет реестра: $open_registry" >&2; exit 2; }
[ -f "$open_noise" ] || { echo "нет реестра: $open_noise" >&2; exit 2; }

items_total=0; as_entry=0; as_own=0
for ru_file in $(cd "$group" && ls */docs/*_RU.md */docs/*/*_RU.md 2>/dev/null); do
  count=$(grep -c '^- \[ \]' "$group/$ru_file" 2>/dev/null)
  [ "$count" -gt 0 ] || continue
  items_total=$((items_total + count))

  # Половины обязаны нести одно число галочек: пункт, живущий в одной, — либо
  # забытый перевод, либо решение, снятое только с одной стороны. 31.08.2026 так
  # нашёлся пункт про языки push-уведомлений, отменённых 2026-08-07.
  en_file="${ru_file%_RU.md}_EN.md"
  if [ -f "$group/$en_file" ]; then
    en_count=$(grep -c '^- \[ \]' "$group/$en_file")
    if [ "$count" != "$en_count" ]; then
      printf '  ✗ %s: незакрытых пунктов RU %s, EN %s\n' "${ru_file%_RU.md}" "$count" "$en_count"
      problems=$((problems + 1))
    fi
  fi

  # Пункт закрыт либо записью в реестре, либо объявлением. Одна запись может
  # законно держать два пункта — «пожаловаться» в меню сообщения и на карточке
  # оффера это одно решение, — а другой пункт может вестись записью из соседнего
  # файла. Поэтому объявляется не «файл целиком», а число пунктов, у которых
  # своего места в реестре нет, и сумма обязана сойтись точно.
  declared=$(grep -v '^#' "$open_noise" | awk -F'\t' -v f="$ru_file" '$1==f {print $2; exit}')
  short=${ru_file#*/}
  entries=$(grep -v '^#' "$open_registry" | awk -F'\t' -v f="$short" '$6 ~ f' | wc -l)

  if [ -n "$declared" ]; then
    if [ $((declared + entries)) != "$count" ]; then
      printf '  ✗ %s: пунктов %s, а записей %s плюс объявлено %s — сумма не сходится\n' \
        "$ru_file" "$count" "$entries" "$declared"
      problems=$((problems + 1))
    else
      as_own=$((as_own + declared)); as_entry=$((as_entry + entries))
    fi
    continue
  fi

  if [ "$entries" -lt "$count" ]; then
    printf '  ✗ %s: незакрытых пунктов %s, записей в open.tsv %s\n' "$ru_file" "$count" "$entries"
    printf '      либо записать недостающие, либо объявить их в noise-open.tsv\n'
    problems=$((problems + 1))
  else
    as_entry=$((as_entry + count))
  fi
done

# --- срок годности шума -------------------------------------------------------
# Строка «эта дата — пример внутри JSON» переживёт и пример, и документ: она
# ничем не связана с явью и молча оправдывает пропуск там, где оправдывать уже
# нечего. Поэтому у каждой отговорки проверяется, что её файл на месте и что
# сама величина в нём всё ещё встречается. Номер строки не проверяется намеренно:
# он сдвигается от любой правки выше, и реестр на номерах краснел бы всегда.
stale=0
while IFS=$'\t' read -r date _kind _why example; do
  case "$date" in ''|'#'*|date) continue ;; esac
  file="${example%%:*}"
  if [ ! -f "$group/$file" ]; then
    printf '  ✗ шум %s ссылается на файл, которого нет: %s\n' "$date" "$file"
    problems=$((problems + 1)); continue
  fi
  year=${date%%-*}; rest=${date#*-}; month=${rest%%-*}; day=${rest##*-}
  if ! grep -qE "$date|$day\.$month\.$year|$((10#$day)) [а-яa-z]+ $year" "$group/$file"; then
    printf '  ✗ шум %s: даты в %s больше нет — отговорка пережила повод\n' "$date" "$file"
    problems=$((problems + 1)); stale=$((stale + 1))
  fi
done < "$noise"

while IFS=$'\t' read -r value unit _kind _why example; do
  case "$value" in ''|'#'*|value) continue ;; esac
  file="${example%%:*}"
  if [ ! -f "$group/$file" ]; then
    printf '  ✗ шум %s %s ссылается на файл, которого нет: %s\n' "$value" "$unit" "$file"
    problems=$((problems + 1)); continue
  fi
  if ! grep -qF "$value" "$group/$file"; then
    printf '  ✗ шум %s %s: числа в %s больше нет — отговорка пережила повод\n' \
      "$value" "$unit" "$file"
    problems=$((problems + 1)); stale=$((stale + 1))
  fi
done < "$numbers_noise"

if [ "$problems" -gt 0 ]; then
  printf '\nпунктов: %s (записями %s, своим списком %s)\n' "$items_total" "$as_entry" "$as_own"
  printf 'дат: %s (решениями %s, шумом %s); пар чисел: %s (пределами %s, шумом %s) — НЕ ПОКРЫТО: %s\n' \
    "$total" "$as_decision" "$as_noise" "$pairs_total" "$as_limit" "$as_prose" "$problems"
  exit 1
fi
printf '\nпунктов: %s (записями %s, своим списком %s)\n' "$items_total" "$as_entry" "$as_own"
printf 'дат: %s (решениями %s, шумом %s); пар чисел: %s (пределами %s, шумом %s) — непокрытых нет\n' \
  "$total" "$as_decision" "$as_noise" "$pairs_total" "$as_limit" "$as_prose"
exit 0
