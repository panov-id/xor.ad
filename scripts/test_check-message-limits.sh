#!/usr/bin/env bash
# Проба ворот пределов сообщения: каждая ветка обязана покраснеть.
#
#   scripts/test_check-message-limits.sh
#
# Правило проекта: ворота, чьего падения никто не видел, — украшение. Здесь их
# четыре разных падения, и каждое проверяется отдельно: порванная связка чисел,
# узел с другими числами, узел, промолчавший о пределе, и узел, ответивший не
# тем кодом. Плюс положительный контроль — узел, который называет ровно те
# числа, что в реестре, обязан дать зелень и ноль.
#
# Живые файлы только читаются: реестр подменяется через FACTS_LIMITS, узел —
# через RELAY_NODE на подставной http.server на 127.0.0.1.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-message-limits.sh"
real_registry="$root/docs/facts/limits.tsv"

work="$(mktemp -d)"
stub_pid=""
cleanup() { [ -n "$stub_pid" ] && kill "$stub_pid" 2>/dev/null; rm -rf "$work"; }
trap cleanup EXIT
registry="$work/limits.tsv"
witness="$work/каким-был.tsv"
cp "$real_registry" "$witness" || { echo "не удалось снять реестр: $real_registry" >&2; exit 2; }
cp "$witness" "$registry"

# Подставной узел: отдаёт то, что лежит в $work/ответ — код в первой строке,
# тело в остальных. Так одна и та же заглушка играет и 501, и 200, и 503.
cat > "$work/stub.py" <<'PY'
import http.server, pathlib, sys

answer = pathlib.Path(sys.argv[2])

class Node(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        lines = answer.read_text(encoding="utf-8").splitlines()
        code, body = int(lines[0]), "\n".join(lines[1:])
        payload = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a): pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Node).serve_forever()
PY

port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
answer="$work/ответ"
printf '501\nchat relay not enabled on this node yet\n' > "$answer"
python3 "$work/stub.py" "$port" "$answer" & stub_pid=$!
node="http://127.0.0.1:$port"
for _ in $(seq 1 40); do
  curl -s -o /dev/null --max-time 1 "$node/chat" && break
  sleep 0.1
done

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output code
  output=$(FACTS_LIMITS="$registry" RELAY_NODE="$node" bash "$gate" 2>&1); code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1))
    printf '  ✗ %s\n      ждали код %s и «%s», получили код %s:\n' "$3" "$1" "$2" "$code"
    printf '%s\n' "$output" | sed 's/^/      | /'
  fi
}

set_answer() { printf '%s\n' "$@" > "$answer"; }
set_value() {  # set_value <id> <значение>
  awk -F'\t' -v OFS='\t' -v want="$1" -v val="$2" \
    '$1 == want { $2 = val } { print }' "$witness" > "$registry"
}

echo "ПРОБА check-message-limits"

# Ноль. Живое состояние: узел ещё заглушка — ворота обязаны сказать это кодом 4,
# а не зеленью. Это не «пройдено», это «проверка отложена и названа».
expect 4 "замер отложен" "узел-заглушка 501 — замер отложен, не зелень"

# Первое падение: связка чисел. Потолок байтов урезан ниже честного провода.
set_value chat.ciphertext.bytes 1024
expect 1 "связка порвана" "потолок байтов ниже провода — красный"
cp "$witness" "$registry"

# То же с другой стороны: символы выросли, потолок остался прежним. Реестр
# check-facts-limits такое пропустит — оба числа по-прежнему стоят в файлах.
set_value chat.message.length 512
expect 1 "связка порвана" "символы выросли, потолок не пересчитан — красный"
cp "$witness" "$registry"

# Второе: узел заработал и называет НЕ те числа.
set_answer '200' '{"max_message_length": 256, "max_ciphertext_bytes": 4096}'
expect 1 "узел говорит 4096" "узел разошёлся с реестром по байтам — красный"

set_answer '200' '{"max_message_length": 140, "max_ciphertext_bytes": 2048}'
expect 1 "узел говорит 140" "узел разошёлся с реестром по символам — красный"

# Третье: узел заработал, но о пределе молчит. Молчащий предел — отсутствующий.
set_answer '200' '{"max_message_length": 256}'
expect 1 "не назвал max_ciphertext_bytes" "узел промолчал о пределе — красный"

# Четвёртое: чужой код ответа. Ни заглушка, ни рабочий чат.
set_answer '503' 'nope'
expect 1 "ответил 503" "неизвестный код ответа — красный"

# Пятое: реестр без нужной строки. Ворота не имеют права молча сверить пустоту.
grep -v '^chat.ciphertext.bytes' "$witness" > "$registry"
expect 2 "нет строки chat.ciphertext.bytes" "реестр без строки предела — код 2"
cp "$witness" "$registry"

# Шестое: подстановка команды в реестре не должна исполниться арифметикой.
set_value chat.ciphertext.bytes 'q[$(touch "'"$work"'/исполнилось")]'
expect 2 "не целое число" "нечисло в реестре отсеяно до арифметики"
if [ -e "$work/исполнилось" ]; then
  failures=$((failures + 1)); printf '  ✗ реестр исполнился как код\n'
else
  printf '  ✓ реестр не исполнился как код\n'
fi
cp "$witness" "$registry"

# Положительный контроль: всё сходится — обязан быть ноль и зелень. Без него
# проба доказывала бы только то, что ворота умеют краснеть, в том числе всегда.
set_answer '200' '{"max_message_length": 256, "max_ciphertext_bytes": 2048}'
expect 0 "узел называет те же числа" "всё сошлось — зелень и ноль"

echo
if [ "$failures" = 0 ]; then
  printf 'проба пройдена: %s проверок, каждое падение ворот увидено\n' "$number"
else
  printf 'проба провалена: %s из %s\n' "$failures" "$number"; exit 1
fi
