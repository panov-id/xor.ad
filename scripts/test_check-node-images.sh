#!/usr/bin/env bash
# Проверка проверки: каждый исход scripts/check-node-images.sh воспроизводится
# на синтетическом стенде и обязан дать свой код выхода и свою строку.
#
#   scripts/test_check-node-images.sh
#
# Зачем. Гейт спрашивает живой пул. Без подмены его ветки исполняются только с
# рабочей машины и только по живым адресам — то есть почти никогда, а ветка,
# которая не исполняется, ломается молча. Стенд: локальный http вместо /health
# и синтетические toml во временном каталоге. Настоящие environments.toml и
# inventory.toml не трогаются ни на одном случае.
#
# Отдельно проверяется то, ради чего гейт и писался: ноль сверенных узлов —
# не зелёный результат, и код выхода обязан это сказать. И различение «имени
# нет в DNS» против «узел лежит»: разные новости, разные действия, и свести их
# в одно «не ответил» значит спрятать упавший узел за ненастроенным.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gate="$here/check-node-images.sh"
work="$(mktemp -d)"
server_pid=""
cleanup() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null
  rm -rf "$work"
  return 0
}
trap cleanup EXIT

failures=0
case_number=0

# --- стенд: подставной /health -----------------------------------------------
answers="$work/answers.json"
printf '{}\n' > "$answers"

cat > "$work/health-server.py" <<'PY'
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

answers_path = sys.argv[1]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Ответы перечитываются на каждом запросе: случаи меняют их по ходу, а
        # поднимать сервер заново на каждый случай — лишний источник мигания.
        with open(answers_path, encoding="utf-8") as handle:
            answers = json.load(handle)
        if self.path not in answers:
            self.send_response(404)
            self.end_headers()
            return
        payload = json.dumps(answers[self.path]).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


server = HTTPServer(("127.0.0.1", 0), Handler)
print(server.server_port, flush=True)
server.serve_forever()
PY

python3 "$work/health-server.py" "$answers" > "$work/port" &
server_pid=$!
port=""
for _ in $(seq 1 50); do
  port="$(cat "$work/port" 2>/dev/null)"
  [ -n "$port" ] && break
  sleep 0.1
done
[ -n "$port" ] || { echo "подставной /health не поднялся — стенд негоден"; exit 1; }

envs_file="$work/environments.toml"
inv_file="$work/inventory.toml"
template="http://127.0.0.1:$port/{host}/health"
health_path="/n1-dev.proba.local/health"

write_envs() {  # write_envs <тег образа для dev>
  printf '[env.dev]\nimage_tag = "%s"\n' "$1" > "$envs_file"
}

write_inventory() {  # write_inventory <ssh_host; пусто — бокс только объявлен>
  { printf '[pool]\ndns_zone = "proba.local"\n\n'
    printf '[[box]]\nid = "n1"\nprovider = "проба"\n'
    [ -n "$1" ] && printf 'ssh_host = "%s"\n' "$1"
    printf 'envs = ["dev"]\n'; } > "$inv_file"
}

check() {  # check <ожидаемый код> <подстрока> <описание>
  case_number=$((case_number + 1))
  local want_code="$1" needle="$2" what="$3" output code ok=да
  output="$(NODE_IMAGES_ENVS="$envs_file" \
            NODE_IMAGES_INVENTORY="$inv_file" \
            NODE_IMAGES_HEALTH_TEMPLATE="$template" \
            "$gate" 2>&1)"
  code=$?
  [ "$code" = "$want_code" ] || ok=нет
  printf '%s' "$output" | grep -qF -- "$needle" || ok=нет
  if [ "$ok" = да ]; then
    printf '  ✓ %s\n' "$what"
  else
    failures=$((failures + 1))
    printf '  ✗ %s\n      ждали код %s и «%s», получили код %s\n' \
      "$what" "$want_code" "$needle" "$code"
    printf '%s\n' "$output" | sed 's/^/      | /'
  fi
}

# --- случаи ------------------------------------------------------------------
echo "ПРОБА ВОРОТ check-node-images"

write_envs sha-aaaaaaa
write_inventory box.proba.local

printf '{"%s": {"image": "sha-aaaaaaa"}}\n' "$health_path" > "$answers"
check 0 "✓ n1/dev" "узел работает записанный образ — зелено, код 0"

printf '{"%s": {"image": "sha-bbbbbbb"}}\n' "$health_path" > "$answers"
check 1 "работает sha-bbbbbbb, а записано sha-aaaaaaa" \
  "на узле чужой образ — красно, код 1"

printf '{"%s": {"status": "ok"}}\n' "$health_path" > "$answers"
check 3 "образ не сообщает" "узел отвечает, но себя не называет — не расхождение"
check 3 "это не зелёный результат" \
  "и ноль сверенных объявлен вслух, а не выдан за успех"

printf '{}\n' > "$answers"
check 3 "недоступен" "стенд ответил 404 — узел есть, а пробы на нём нет"

# https, а не http: гейт с 02.09.2026 отвергает не-https для нелокальных
# адресов. На результат случая это не влияет — имя не резолвится раньше TLS.
template="https://{host}.no-such-host.invalid/health"
check 3 "имени нет в DNS" "несуществующее имя — бокс не доведён до dns"

dead_port="$(python3 -c 'import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()')"
template="http://127.0.0.1:$dead_port/{host}/health"
check 3 "узел лежит" "закрытый порт — соединение отклонено, и это другая новость"

# --- негодный шаблон адреса ------------------------------------------------
# Всё это отказ старта (код 2), а не приговор пулу: до 02.09.2026 шаблон без
# {host} давал зелень по одному адресу, сломанная скобка читалась как «узел
# недоступен», а чужой ключ — как «расхождение, выкат не доехал».
template="https://один-адрес-на-всех.invalid/health"
check 2 "без {host}" "шаблон без {host} — отказ, а не опрос всех по одному адресу"

# {host} на месте, а разбор всё равно падает — иначе срабатывает проверка выше
# и ветка «не разбирается» не исполняется ни разу.
template='https://{host}/health}'
check 2 "не разбирается" "лишняя скобка — отказ старта, а не «узел недоступен»"

template='https://{host}.{env}.invalid/health'
check 2 "не разбирается" "чужой ключ рядом с {host} — отказ старта, а не «расхождение»"

template='http://пример.invalid/{host}/health'
check 2 "не https и не локальный" "не-https на нелокальный адрес отвергается"

template="http://127.0.0.1:$port/{host}/health"
printf '{"%s": {"image": "sha-aaaaaaa"}}\n' "$health_path" > "$answers"
write_envs sha-aaaaaaa
write_inventory box.proba.local
check 0 "адрес пробы подменён" "нестандартный шаблон назван вслух в отчёте"

template="http://127.0.0.1:$port/{host}/health"
printf '[env.staging]\nimage_tag = "sha-ccccccc"\n' > "$envs_file"
check 1 "сверять не с чем" "среда есть в пуле, но не записана в environments"

write_envs sha-aaaaaaa
write_inventory ""
check 3 "бокс объявлен, но не заведён" \
  "объявленный, но не созданный бокс — не провал и не сверка"

printf '[pool]\n\n[[box]]\nid = "n1"\nssh_host = "x"\nenvs = ["dev"]\n' > "$inv_file"
check 1 "не объявлена dns_zone" "inventory без зоны — имя узла не собрать"

inv_file="$work/такого-файла-нет.toml"
check 2 "пул не опрошен" "без inventory гейт отказывается, а не зеленеет"

printf '\nслучаев: %d · провалов: %d\n' "$case_number" "$failures"
[ "$failures" = 0 ] || exit 1
