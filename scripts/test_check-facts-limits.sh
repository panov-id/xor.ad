#!/usr/bin/env bash
# Проверка ворот реестра пределов: каждое расхождение обязано покраснеть.
#
#   scripts/test_check-facts-limits.sh
#
# Пробы у этих ворот не было до 03.09.2026 — пункт gates.without.probe. Цена
# отсутствия здесь выше обычной: гейт сверяет числа по нескольким файлам и трём
# репозиториям, то есть ровно тот случай, который однажды уже прошёл мимо
# двенадцати проверок. Ворота, чьё падение никто не видел, о таком случае
# сообщат тем же зелёным отчётом.
#
# Обе стороны гейта проверяются: реестр → документы и таблица протокола →
# реестр. Живые файлы только читаются, пути подменяются через FACTS_LIMITS и
# FACTS_PROTOCOL_RU.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-facts-limits.sh"
real_registry="$root/docs/facts/limits.tsv"
real_protocol="$root/docs/protocol_RU.md"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
registry="$work/limits.tsv"
protocol="$work/protocol_RU.md"
witness="$work/каким-был.tsv"
protocol_witness="$work/протокол-каким-был.md"
cp "$real_registry" "$witness" || { echo "не удалось снять реестр: $real_registry" >&2; exit 2; }
cp "$real_protocol" "$protocol_witness" || { echo "не удалось снять протокол" >&2; exit 2; }
cp "$protocol_witness" "$protocol"

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output
  output=$(FACTS_LIMITS="$registry" FACTS_PROTOCOL_RU="$protocol" bash "$gate" 2>&1)
  local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
probe() { cp "$witness" "$registry"; printf '%s\n' "$1" >> "$registry"; }

echo "СЛУЧАИ"
cp "$witness" "$registry"
expect 0 'числа сходятся везде' 'нынешний реестр в порядке'

# Сторона первая: значение обязано стоять в каждом названном файле. Это тот
# самый случай — одно решение, несколько файлов, и расхождение между ними.
probe "$(printf 'probe.missing\t987654\tсимволов\tпроба\tничем\txor.ad/docs/protocol_RU.md')"
expect 1 'не найдено в' 'значение не стоит в названном файле'

probe "$(printf 'probe.nofile\t128\tсимволов\tпроба\tничем\txor.ad/docs/такого-файла-нет.md')"
expect 1 'файла нет' 'реестр называет файл, которого нет'

# Нечисловое значение отсекается до арифметики. Проверка не косметическая:
# ниже по коду стоит $((value % 1000)), а bash вычисляет содержимое переменной
# как выражение — значение вида q[$(команда)] в этом месте исполняло бы команду.
probe "$(printf 'probe.notnumber\tсто\tсимволов\tпроба\tничем\txor.ad/docs/protocol_RU.md')"
expect 1 'не число' 'значение в реестре не число'

# Сторона вторая: число из таблицы «Пределы» протокола обязано быть в реестре.
# Без неё предел, заведённый мимо реестра, тихо остаётся неучтённым.
cp "$witness" "$registry"
python3 - "$protocol" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
mark = '## 5. Пределы'
i = s.index(mark)
j = s.index('\n| ', i)                      # первая строка таблицы
k = s.index('\n', j + 1)
row = '\n| Выдуманный предел | 987654 символов | нигде |'
io.open(p, 'w', encoding='utf-8').write(s[:k] + row + s[k:])
PY
expect 1 'не заведён в реестре' 'предел из таблицы протокола мимо реестра'
cp "$protocol_witness" "$protocol"

# Ноль сверок при живой таблице — расхождение, а не «нечего проверять»: числа
# в протоколе есть, а в реестре их нет.
grep '^#' "$witness" > "$registry"
expect 1 'не заведён в реестре' 'пустой реестр при живой таблице краснеет'

# А вот два нуля сходились между собой и давали успех — до 01.09.2026 гейт на
# этом печатал «числа сходятся везде». Отдельный код обязан остаться.
: > "$protocol"
expect 3 'проверять было нечего' 'пусты обе стороны — отдельный исход'
cp "$protocol_witness" "$protocol"

number=$((number + 1))
# Сравнивать живой файл сам с собой бессмысленно — так контроль всегда зелёный;
# сверяемся со снимком, снятым до первой пробы.
if diff -q "$witness" "$real_registry" >/dev/null \
   && diff -q "$protocol_witness" "$real_protocol" >/dev/null; then
  printf '  ✓ живые docs/facts/limits.tsv и protocol_RU.md не тронуты\n'
else
  failures=$((failures + 1)); printf '  ✗ живой файл изменился за время проб\n'
fi

echo
if [ "$failures" -gt 0 ]; then
  printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1
fi
printf 'случаев: %s — каждое расхождение видно\n' "$number"
