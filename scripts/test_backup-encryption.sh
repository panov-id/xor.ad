#!/usr/bin/env bash
# Ночной дамп шифруется перед отправкой, расшифровывается обратно, не оставляет
# следов и уходит из хранилища через четырнадцать дней.
#
#   scripts/test_backup-encryption.sh
#
# Зачем. DPA Hetzner, принятый 21.09.2026, относит шифрование копий в покое к
# нашей ответственности, а до того дамп уходил в чужое хранилище открытым
# текстом. Первая версия шифрования в тот же день прошла через вторую панель
# ревью, и та нашла в ней четыре вещи, которые эта проба теперь исполняет, а не
# читает: ротация не удаляла зашифрованные объекты; сбой посередине оставлял
# открытый дамп и ключ данных на диске; ключ данных шёл в аргументах процесса;
# ключ сперва уходил в хранилище, а дамп вторым.
#
# Стороны:
#   с ключом        уходят .sql.gz.enc и .key.enc, дамп раньше ключа, открытого
#                   нет; расшифровка приватной половиной — байт в байт
#   чужой ключ      не открывает
#   без ключа       копия делается, предупреждение сказано вслух
#   битый ключ      отказ ДО дампа: pg_dump не вызван, ничего не выгружено
#   следы           после каждого прогона рабочий каталог скрипта удалён
#   аргументы       ни одному вызову openssl пароль данных не передан в argv
#   ротация         старые .sql.gz, .sql.gz.enc и .key.enc удаляются, свежие нет
#
# Коды выхода: 0 — все стороны сошлись; 1 — нет; 2 — не с чего начать.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
script="${BACKUP_SCRIPT:-$root/relay/wizard/backup-postgres.sh}"
[ -f "$script" ] || { echo "нет скрипта: $script" >&2; exit 2; }
real_openssl="$(command -v openssl)" || { echo "нет openssl — проба не может ни зашифровать, ни проверить" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/compose" "$work/uploads" "$work/scratch"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/private.pem" 2>/dev/null
openssl pkey -in "$work/private.pem" -pubout -out "$work/public.pem" 2>/dev/null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/stranger.pem" 2>/dev/null
pubkey="$(base64 -w0 < "$work/public.pem")"

write_env() {  # write_env <значение BACKUP_PUBLIC_KEY или пусто>
  cat > "$work/compose/backup.env" <<EOF
BUNNY_STORAGE_ZONE=probe-zone
BUNNY_STORAGE_KEY=probe-key
BUNNY_STORAGE_HOST=storage.example.invalid
POSTGRES_PASSWORD=probe-password
DATABASES=relay_prod
EOF
  [ -n "$1" ] && echo "BACKUP_PUBLIC_KEY=$1" >> "$work/compose/backup.env"
}

# docker: дамп на stdout и его копия на диске пробы — сравнивать не с чем, если
# оригинал выброшен. Каждый вызов pg_dump отмечается.
cat > "$work/bin/docker" <<EOF
#!/usr/bin/env bash
case " \$* " in
  *" pg_dump "*) echo pg_dump >> "$work/calls"; head -c 4096 /dev/urandom | tee "$work/dump.raw" ;;
  *) exit 1 ;;
esac
EOF

# curl: складывает тело PUT под именем объекта, записывает порядок PUT и все
# DELETE, а на листинг отдаёт то, что лежит в listing.json.
cat > "$work/bin/curl" <<EOF
#!/usr/bin/env bash
body=""; url=""; method=GET
while [ \$# -gt 0 ]; do
  case "\$1" in
    --data-binary) body="\${2#@}"; shift 2 ;;
    -X) method="\$2"; shift 2 ;;
    http*) url="\$1"; shift ;;
    *) shift ;;
  esac
done
name="\$(basename "\$url")"
case "\$method" in
  PUT) cp "\$body" "$work/uploads/\$name"; echo "PUT \$name" >> "$work/calls" ;;
  DELETE) echo "DELETE \$name" >> "$work/calls" ;;
  *) cat "$work/listing.json" 2>/dev/null || printf '[]' ;;
esac
EOF

# openssl: настоящий, но каждый вызов записывает свои аргументы. Так «ключ не
# в argv» проверяется исполнением, а не поиском строки в тексте скрипта.
cat > "$work/bin/openssl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$work/openssl-argv"
exec "$real_openssl" "\$@"
EOF
chmod +x "$work/bin/"*

run() {
  rm -rf "$work/uploads/"* "$work/scratch/"* "$work/calls" "$work/openssl-argv" "$work/out.log"
  RELAY_COMPOSE_DIR="$work/compose" PATH="$work/bin:$PATH" TMPDIR="$work/scratch" \
    bash "$script" > "$work/out.log" 2>&1
}
left_behind() { find "$work/scratch" -mindepth 1 | head -3; }

failures=0
fail() { failures=$((failures + 1)); printf '  ✗ %s\n' "$1"; }
pass() { printf '  ✓ %s\n' "$1"; }

# --- с ключом ------------------------------------------------------------------
write_env "$pubkey"
echo '[]' > "$work/listing.json"
run; code=$?
enc="$(ls "$work/uploads" | grep -c '\.sql\.gz\.enc$' || true)"
sealed="$(ls "$work/uploads" | grep -c '\.key\.enc$' || true)"
plain="$(ls "$work/uploads" | grep -c '\.sql\.gz$' || true)"
if [ "$code" = 0 ] && [ "$enc" = 1 ] && [ "$sealed" = 1 ] && [ "$plain" = 0 ]; then
  pass "с ключом: улетели .sql.gz.enc и .key.enc, открытого дампа нет"
else
  fail "с ключом: код $code, шифрованных $enc, ключей $sealed, ОТКРЫТЫХ $plain"
  sed 's/^/      | /' "$work/out.log" | tail -5
fi

order="$(grep '^PUT' "$work/calls" 2>/dev/null | sed 's/^PUT //' | tr '\n' ' ')"
case "$order" in
  *.sql.gz.enc*.key.enc*) pass "дамп выгружен раньше ключа — сбой второго PUT не оставит ключа без дампа" ;;
  *) fail "порядок выгрузки: $order" ;;
esac

[ -z "$(left_behind)" ] && pass "после прогона рабочий каталог скрипта удалён" \
  || fail "после прогона остались файлы: $(left_behind | tr '\n' ' ')"

if grep -Eq -- '-K |-iv |-pass pass:' "$work/openssl-argv" 2>/dev/null; then
  fail "пароль данных передан openssl в аргументах: $(grep -E -- '-K |-pass pass:' "$work/openssl-argv" | head -1 | cut -c1-60)…"
elif grep -q -- '-pass file:' "$work/openssl-argv" 2>/dev/null; then
  pass "пароль данных передан файлом, в argv его нет"
else
  fail "openssl enc не вызывался с -pass file: — шифрование шло каким-то другим путём"
fi

if [ "$enc" = 1 ] && [ "$sealed" = 1 ]; then
  "$real_openssl" pkeyutl -decrypt -inkey "$work/private.pem" \
    -in "$work/uploads/"*.key.enc -pkeyopt rsa_padding_mode:oaep \
    -out "$work/pass.back" 2>/dev/null
  "$real_openssl" enc -d -aes-256-cbc -pbkdf2 -pass "file:$work/pass.back" \
    -in "$work/uploads/"*.sql.gz.enc 2>/dev/null | gunzip -c > "$work/back.raw" 2>/dev/null
  cmp -s "$work/dump.raw" "$work/back.raw" \
    && pass "расшифровка приватной половиной даёт исходный дамп байт в байт" \
    || fail "расшифрованное не совпало с дампом — копия есть, восстановления нет"

  if "$real_openssl" pkeyutl -decrypt -inkey "$work/stranger.pem" \
       -in "$work/uploads/"*.key.enc -pkeyopt rsa_padding_mode:oaep \
       -out "$work/stranger.txt" 2>/dev/null; then
    fail "чужая приватная половина открыла пароль данных"
  else
    pass "чужая приватная половина не открывает"
  fi
fi

# --- битый ключ ----------------------------------------------------------------
write_env "это-не-ключ"
run; code=$?
dumped="$(grep -c '^pg_dump' "$work/calls" 2>/dev/null || true)"
uploaded="$(ls "$work/uploads" | wc -l)"
if [ "$code" != 0 ] && [ "${dumped:-0}" = 0 ] && [ "$uploaded" = 0 ] && [ -z "$(left_behind)" ]; then
  pass "битый ключ: отказ до дампа, ничего не выгружено и ничего не осталось на диске"
else
  fail "битый ключ: код $code, вызовов pg_dump ${dumped:-0}, выгружено $uploaded, осталось: $(left_behind | tr '\n' ' ')"
fi

# --- без ключа -----------------------------------------------------------------
write_env ""
run; code=$?
plain="$(ls "$work/uploads" | grep -c '\.sql\.gz$' || true)"
if [ "$code" = 0 ] && [ "$plain" = 1 ] && grep -q "BACKUP_PUBLIC_KEY is not set" "$work/out.log"; then
  pass "без ключа: копия делается, но предупреждение сказано вслух"
else
  fail "без ключа: код $code, открытых дампов $plain, предупреждения нет"
fi

# --- ротация -------------------------------------------------------------------
write_env "$pubkey"
old="2000-01-01T00-00-00Z"
fresh="$(date -u +%Y-%m-%d)T00-00-00Z"
cat > "$work/listing.json" <<EOF
[{"ObjectName":"$old.sql.gz"},{"ObjectName":"$old.sql.gz.enc"},{"ObjectName":"$old.key.enc"},
 {"ObjectName":"$fresh.sql.gz.enc"},{"ObjectName":"$fresh.key.enc"}]
EOF
run
gone="$(grep '^DELETE' "$work/calls" 2>/dev/null | sed 's/^DELETE //' | sort | tr '\n' ' ')"
want="$(printf '%s\n' "$old.key.enc" "$old.sql.gz" "$old.sql.gz.enc" | sort | tr '\n' ' ')"
if [ "$gone" = "$want" ]; then
  pass "ротация: старые .sql.gz, .sql.gz.enc и .key.enc удалены, свежие остались"
else
  fail "ротация удалила «$gone», а должна «$want»"
fi

if [ "$failures" = 0 ]; then
  echo "шифрование ночного дампа: все стороны сошлись"
  exit 0
fi
echo "расхождений: $failures"
exit 1
