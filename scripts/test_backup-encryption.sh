#!/usr/bin/env bash
# Ночной дамп шифруется перед отправкой, и расшифровывается обратно.
#
#   scripts/test_backup-encryption.sh
#
# Зачем. DPA Hetzner, принятый 21.09.2026, относит шифрование копий в покое к
# нашей ответственности (приложение TOM, стр. 20), а до того дамп уходил в
# чужое хранилище открытым текстом — вся база целиком. Шифрование добавлено в
# relay/wizard/backup-postgres.sh, и без этой пробы «зашифровано» означало бы
# только «в скрипте есть слово openssl».
#
# Проверяется тремя сторонами:
#   с ключом      в хранилище уходят ДВА объекта — .sql.gz.enc и .key.enc, и ни
#                 одного открытого; расшифровка приватной половиной даёт байт в
#                 байт исходный дамп
#   без ключа     скрипт всё равно делает копию, но кричит об этом в stderr:
#                 остановить ночной бэкап хуже, чем оставить его видимо слабым
#   не тот ключ   расшифровка чужой приватной половиной падает — иначе
#                 «расшифровалось» ничего не доказывало бы
#
# Коды выхода: 0 — все три стороны сошлись; 1 — нет; 2 — не с чего начать.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
script="${BACKUP_SCRIPT:-$root/relay/wizard/backup-postgres.sh}"
[ -f "$script" ] || { echo "нет скрипта: $script" >&2; exit 2; }
command -v openssl >/dev/null || { echo "нет openssl — проба не может ни зашифровать, ни проверить" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/compose" "$work/uploads"

# Два ключа: свой и чужой. Второй нужен ровно затем, чтобы «расшифровалось»
# что-то значило.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/private.pem" 2>/dev/null
openssl pkey -in "$work/private.pem" -pubout -out "$work/public.pem" 2>/dev/null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/stranger.pem" 2>/dev/null

cat > "$work/compose/backup.env" <<EOF
BUNNY_STORAGE_ZONE=probe-zone
BUNNY_STORAGE_KEY=probe-key
BUNNY_STORAGE_HOST=storage.example.invalid
POSTGRES_PASSWORD=probe-password
DATABASES=relay_prod
BACKUP_PUBLIC_KEY=$(base64 -w0 < "$work/public.pem")
EOF

# docker: тот же дамп, что и в check-backup-script.sh, но отложенный на диск —
# сравнивать расшифрованное не с чем, если оригинал выброшен.
cat > "$work/bin/docker" <<EOF
#!/usr/bin/env bash
case " \$* " in
  *" pg_dump "*) head -c 4096 /dev/urandom | tee "$work/dump.raw" ;;
  *) exit 1 ;;
esac
EOF

# curl: складывает тело каждого PUT под именем объекта, чтобы проба смотрела на
# то, что действительно улетело бы, а не на то, что осталось в /tmp.
cat > "$work/bin/curl" <<EOF
#!/usr/bin/env bash
body=""; url=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    --data-binary) body="\${2#@}"; shift 2 ;;
    http*) url="\$1"; shift ;;
    *) shift ;;
  esac
done
if [ -n "\$body" ] && [ -n "\$url" ]; then
  cp "\$body" "$work/uploads/\$(basename "\$url")"
else
  [ -n "\$url" ] && printf '[]'
fi
EOF
chmod +x "$work/bin/"*

run() {  # run <env-присвоения…> → код выхода
  rm -f "$work/uploads/"* "$work/out.log"
  env "$@" RELAY_COMPOSE_DIR="$work/compose" PATH="$work/bin:$PATH" TMPDIR="$work" \
    bash "$script" > "$work/out.log" 2>&1
}

failures=0

# --- сторона 1: с ключом ------------------------------------------------------
run
code=$?
enc="$(ls "$work/uploads" | grep -c '\.sql\.gz\.enc$' || true)"
sealed="$(ls "$work/uploads" | grep -c '\.key\.enc$' || true)"
plain="$(ls "$work/uploads" | grep -c '\.sql\.gz$' || true)"

if [ "$code" = 0 ] && [ "$enc" = 1 ] && [ "$sealed" = 1 ] && [ "$plain" = 0 ]; then
  printf '  ✓ с ключом: улетели .sql.gz.enc и .key.enc, открытого дампа нет\n'
else
  failures=$((failures + 1))
  printf '  ✗ с ключом: код %s, шифрованных %s, ключей %s, ОТКРЫТЫХ %s\n' "$code" "$enc" "$sealed" "$plain"
  ls "$work/uploads" | sed 's/^/      | /'
fi

if [ "$enc" = 1 ] && [ "$sealed" = 1 ]; then
  openssl pkeyutl -decrypt -inkey "$work/private.pem" \
    -in "$work/uploads/"*.key.enc -pkeyopt rsa_padding_mode:oaep \
    -out "$work/datakey.txt" 2>/dev/null
  openssl enc -d -aes-256-cbc \
    -K "$(sed -n 1p "$work/datakey.txt")" -iv "$(sed -n 2p "$work/datakey.txt")" \
    -in "$work/uploads/"*.sql.gz.enc -out "$work/back.gz" 2>/dev/null
  gunzip -c "$work/back.gz" > "$work/back.raw" 2>/dev/null
  if cmp -s "$work/dump.raw" "$work/back.raw"; then
    printf '  ✓ расшифровка приватной половиной даёт исходный дамп байт в байт\n'
  else
    failures=$((failures + 1))
    printf '  ✗ расшифрованное не совпало с дампом — копия есть, восстановления нет\n'
  fi

  # --- сторона 3: чужой ключ ---------------------------------------------------
  if openssl pkeyutl -decrypt -inkey "$work/stranger.pem" \
       -in "$work/uploads/"*.key.enc -pkeyopt rsa_padding_mode:oaep \
       -out "$work/stranger.txt" 2>/dev/null; then
    failures=$((failures + 1))
    printf '  ✗ чужая приватная половина открыла ключ данных — шифрование ничего не держит\n'
  else
    printf '  ✓ чужая приватная половина не открывает — «расшифровалось» что-то значит\n'
  fi
fi

# --- сторона 2: без ключа -----------------------------------------------------
sed -i '/^BACKUP_PUBLIC_KEY=/d' "$work/compose/backup.env"
run
code=$?
plain="$(ls "$work/uploads" | grep -c '\.sql\.gz$' || true)"
if [ "$code" = 0 ] && [ "$plain" = 1 ] && grep -q "BACKUP_PUBLIC_KEY is not set" "$work/out.log"; then
  printf '  ✓ без ключа: копия делается, но предупреждение сказано вслух\n'
else
  failures=$((failures + 1))
  printf '  ✗ без ключа: код %s, открытых дампов %s, предупреждения нет\n' "$code" "$plain"
  sed 's/^/      | /' "$work/out.log" | tail -6
fi

if [ "$failures" = 0 ]; then
  echo "шифрование ночного дампа: три стороны сошлись"
  exit 0
fi
echo "расхождений: $failures"
exit 1
