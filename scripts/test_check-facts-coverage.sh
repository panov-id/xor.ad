#!/usr/bin/env bash
# Проверка покрытия обязана видеть непокрытую дату. Здесь она создаётся.
#
#   scripts/test_check-facts-coverage.sh
#
# Зачем. Покрытие — единственная проверка, которая говорит «мы посмотрели всё»,
# и цена ошибки у неё выше остальных: молчаливое «непокрытых нет» закрывает тему
# целиком. Поэтому каждый её вывод здесь получен из сломанного состояния.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-facts-coverage.sh"
probe="$root/docs/facts/probe-date_RU.md"
noise="$root/docs/facts/noise.tsv"
decisions="$root/docs/facts/decisions.tsv"

backup_noise=$(mktemp); cp "$noise" "$backup_noise"
restore() { cp "$backup_noise" "$noise"; rm -f "$backup_noise" "$probe" "${probe/_RU/_EN}"; }
trap restore EXIT

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -3 | sed 's/^/      | /'
  fi
}

echo "СЛУЧАИ"
expect 0 'непокрытых нет' 'нынешнее состояние покрыто целиком'

# Новая дата в документе — ровно то, что происходит при каждой правке спеки.
printf -- '# Проба\n\n- **Решение пробы** — 03.03.2029, чтобы покрытие его увидело.\n' > "$probe"
printf -- '# Probe\n\n- **A probe decision** — 2029-03-03, so coverage sees it.\n' > "${probe/_RU/_EN}"
expect 1 '2029-03-03 не покрыта' 'новая дата в документе всплывает непокрытой'

printf '2029-03-03\tsample.data\tпроба\txor.ad/docs/facts/probe-date_RU.md:3\n' >> "$noise"
expect 0 'непокрытых нет' 'объявленная шумом дата закрывает покрытие'

# Дата, объявленная шумом, но уже заведённая решением: отговорка пережила решение.
existing=$(grep -v '^#' "$decisions" | cut -f2 | grep -E '^20' | head -1)
printf '%s\tsample.data\tпроба конфликта\txor.ad/docs/facts/probe-date_RU.md:3\n' "$existing" >> "$noise"
expect 1 'отговорка пережила решение' 'дата и в решениях, и в шуме — находка'
# Реестр возвращается сразу: случай, оставляющий за собой сломанное состояние,
# проваливает следующие и выдаёт свою грязь за их находку.
cp "$backup_noise" "$noise"

# --- вторая половина: числа ---------------------------------------------------
numbers_noise="$root/docs/facts/noise-numbers.tsv"
backup_numbers=$(mktemp); cp "$numbers_noise" "$backup_numbers"

printf -- '# Проба\n\n- Порог пробы — **777 символов** в строке.\n' > "$probe"
printf -- '# Probe\n\n- The probe threshold is **777 characters** in a line.\n' > "${probe/_RU/_EN}"
expect 1 '777 chars не покрыто' 'новое число с единицей всплывает непокрытым'

printf '777\tchars\tsample.data\tпроба\txor.ad/docs/facts/probe-date_RU.md:3\n' >> "$numbers_noise"
expect 0 'непокрытых нет' 'объявленное шумом число закрывает покрытие'

# Единица в другом падеже — то же число, а не новое: без нормализации покрытие
# распадается на «символов» и «символами» и никогда не сходится.
printf -- '# Проба\n\n- Порог пробы — **777 символами** в строке.\n' > "$probe"
expect 0 'непокрытых нет' 'падеж единицы не создаёт новой пары'

cp "$backup_numbers" "$numbers_noise"; rm -f "$backup_numbers" "$probe" "${probe/_RU/_EN}"

# --- третья половина: открытые пункты ------------------------------------------
open_noise="$root/docs/facts/noise-open.tsv"
backup_open_noise=$(mktemp); cp "$open_noise" "$backup_open_noise"
victim="$root/docs/review-checklist_RU.md"
victim_en="$root/docs/review-checklist_EN.md"
backup_victim=$(mktemp); cp "$victim" "$backup_victim"
backup_victim_en=$(mktemp); cp "$victim_en" "$backup_victim_en"

printf -- '\n- [ ] Проба: пункт, которого нет в реестре.\n' >> "$victim"
printf -- '\n- [ ] A probe item, absent from the registry.\n' >> "$victim_en"
expect 1 'записей в open.tsv' 'новый незакрытый пункт всплывает непокрытым'

printf 'xor.ad/docs/review-checklist_RU.md\t1\tchecklist.own\tпроба\n' >> "$open_noise"
expect 0 'непокрытых нет' 'объявленный пункт закрывает покрытие'
cp "$backup_open_noise" "$open_noise"

# Пункт, снятый только с одной стороны, — либо забытый перевод, либо решение,
# исполненное наполовину. Так нашёлся пункт про языки push-уведомлений,
# отменённых 2026-08-07: в русской половине его сняли, в английской забыли.
cp "$backup_victim_en" "$victim_en"
expect 1 'незакрытых пунктов RU' 'пункт есть в одной половине и нет в другой'

cp "$backup_victim" "$victim"; cp "$backup_victim_en" "$victim_en"
rm -f "$backup_victim" "$backup_victim_en" "$backup_open_noise"

# --- срок годности шума --------------------------------------------------------
# Отговорка обязана умирать вместе с поводом: пока этого нет, реестр шума растёт
# и начинает оправдывать пропуски, которых уже не существует.
backup_noise2=$(mktemp); cp "$noise" "$backup_noise2"
backup_numbers2=$(mktemp); cp "$numbers_noise" "$backup_numbers2"

printf '2031-01-01\tsample.data\tпроба\txor.ad/docs/protocol_RU.md:1\n' >> "$noise"
expect 1 'отговорка пережила повод' 'шум на дату, которой в файле нет'
cp "$backup_noise2" "$noise"

printf '2031-01-01\tsample.data\tпроба\txor.ad/docs/no-such-file_RU.md:1\n' >> "$noise"
expect 1 'ссылается на файл, которого нет' 'шум на пропавший файл'
cp "$backup_noise2" "$noise"

printf '999999\tchars\tsample.data\tпроба\txor.ad/docs/protocol_RU.md:1\n' >> "$numbers_noise"
expect 1 'отговорка пережила повод' 'шум на число, которого в файле нет'
cp "$backup_numbers2" "$numbers_noise"
rm -f "$backup_noise2" "$backup_numbers2"

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1; fi
printf 'случаев: %s — покрытие видит и непокрытое, и лишнее\n' "$number"
