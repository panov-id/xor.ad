#!/usr/bin/env bash
# Три числа предела сообщения — как связка, и живая проба узла.
#
#   scripts/check-message-limits.sh
#
# Зачем отдельные ворота, когда есть check-facts-limits. Тот держит каждое число
# порознь: 256 обязано найтись в четырёх файлах, 2048 — в тех же четырёх. Но
# 2048 не самостоятельное число, а следствие 256: узел видит шифротекст и
# считает байты, клиент считает символы, и потолок байтов посчитан по худшему
# случаю от потолка символов. Поменяют 256 на 512 — реестр останется зелёным,
# потому что оба числа по-прежнему стоят везде, где записаны, а связь между ними
# порвётся молча. Здесь она пересчитывается.
#
# Арифметика — та, что записана в docs/chat_RU.md:1405 и в пункте G6:
#   256 символов эмодзи → 1024 байта UTF-8 (4 байта на символ)
#   + nonce 12 и тег AES-GCM 16                → 1052
#   base64: ceil(1052/3)*4                      → 1404
# Значит max_ciphertext_bytes обязан быть не меньше 1404. 2048 даёт запас 46%.
#
# Сторона вторая — узел. Пункт G6 закрывается не чтением спеки, а замером
# запросом мимо клиента: узел обязан САМ назвать оба предела при открытии чата.
# Пока кода чата на узле нет, замер невозможен, и ворота говорят это вслух
# кодом 4, а не выдают зелень за проверку, которой не было.
#
# Коды выхода: 0 — связка сходится и узел назвал те же числа; 1 — расхождение;
# 2 — нет реестра или в нём нет нужных строк; 3 — сверять было нечего;
# 4 — арифметика сошлась, но узел ещё без чата и замер отложен.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
registry="${FACTS_LIMITS:-$root/docs/facts/limits.tsv}"
node="${RELAY_NODE:-https://api.relay.panov.id}"
# Проба узла отключается для прогона без сети; отключённая говорит об этом.
probe="${MESSAGE_LIMITS_PROBE:-1}"

[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }

value_of() {  # value_of <id> — единственное значение строки реестра
  awk -F'\t' -v want="$1" '$1 == want { print $2; found = 1 } END { exit !found }' "$registry"
}

chars=$(value_of chat.message.length) || {
  echo "в реестре нет строки chat.message.length: $registry" >&2; exit 2; }
bytes=$(value_of chat.ciphertext.bytes) || {
  echo "в реестре нет строки chat.ciphertext.bytes: $registry" >&2; exit 2; }

# Значения из реестра идут в арифметику, поэтому проверяются до неё — тот же
# урок, что в check-facts-limits: bash вычисляет содержимое переменной как
# выражение, и подстановка команды в реестре исполнилась бы здесь.
for pair in "chat.message.length=$chars" "chat.ciphertext.bytes=$bytes"; do
  case "${pair#*=}" in
    ''|*[!0-9]*)
      printf 'значение %s не целое число — реестр держит числа\n' "$pair" >&2; exit 2 ;;
  esac
done
[ "$chars" -gt 0 ] && [ "$bytes" -gt 0 ] || { echo "нечего сверять: нули в реестре" >&2; exit 3; }

problems=0
checked=0

# --- сторона первая: связка чисел -------------------------------------------
utf8=$((chars * 4))                 # эмодзи — четыре байта
sealed=$((utf8 + 12 + 16))          # nonce и тег AES-GCM
wire=$(( (sealed + 2) / 3 * 4 ))    # base64, с округлением вверх
checked=$((checked + 1))
if [ "$bytes" -lt "$wire" ]; then
  printf '  ✗ связка порвана: %s символов дают %s байт на проводе, а узлу позволено %s\n' \
    "$chars" "$wire" "$bytes"
  printf '      честное сообщение будет отвергнуто узлом; пересчитайте chat.ciphertext.bytes\n'
  problems=$((problems + 1))
else
  margin=$(( (bytes - wire) * 100 / wire ))
  printf '  ✓ связка цела: %s символов → %s байт на проводе, потолок %s, запас %s%%\n' \
    "$chars" "$wire" "$bytes" "$margin"
fi

# --- сторона вторая: что скажет сам узел ------------------------------------
if [ "$probe" != 1 ]; then
  printf '  · проба узла отключена (MESSAGE_LIMITS_PROBE=%s) — узел не спрошен\n' "$probe"
  [ "$problems" -gt 0 ] && exit 1
  exit 4
fi

body=$(curl -s --max-time 15 -w '\n%{http_code}' "$node/chat" 2>/dev/null)
code=$(printf '%s' "$body" | tail -1)
json=$(printf '%s' "$body" | sed '$d')

case "$code" in
  501)
    printf '  · узел %s: /chat отвечает 501 — кода чата ещё нет, замер отложен\n' "$node"
    printf '      пункт G6 закрывается в день, когда этот ответ станет 200\n'
    [ "$problems" -gt 0 ] && exit 1
    exit 4 ;;
  200) ;;
  000)
    printf '  ✗ узел %s не ответил: сети нет или адрес закрыт\n' "$node"
    exit 1 ;;
  *)
    printf '  ✗ узел %s: /chat ответил %s — ни 501 заглушки, ни 200 рабочего чата\n' "$node" "$code"
    exit 1 ;;
esac

# Узел ответил рабочим чатом: он обязан назвать оба предела сам.
said_chars=$(printf '%s' "$json" | grep -oE '"max_message_length"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+$')
said_bytes=$(printf '%s' "$json" | grep -oE '"max_ciphertext_bytes"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+$')

for named in "max_message_length:$said_chars:$chars" "max_ciphertext_bytes:$said_bytes:$bytes"; do
  field=${named%%:*}; rest=${named#*:}; said=${rest%%:*}; want=${rest#*:}
  checked=$((checked + 1))
  if [ -z "$said" ]; then
    printf '  ✗ узел не назвал %s при открытии чата — предел молчит, значит его нет\n' "$field"
    problems=$((problems + 1))
  elif [ "$said" != "$want" ]; then
    printf '  ✗ %s: узел говорит %s, реестр держит %s\n' "$field" "$said" "$want"
    problems=$((problems + 1))
  else
    printf '  ✓ %s: узел говорит %s — сходится с реестром\n' "$field" "$said"
  fi
done

[ "$checked" -gt 0 ] || { echo "нечего было сверять" >&2; exit 3; }
if [ "$problems" -gt 0 ]; then
  printf 'расхождений: %s\n' "$problems"
  exit 1
fi
printf 'пределы сообщения сверены: связка цела, узел называет те же числа\n'
