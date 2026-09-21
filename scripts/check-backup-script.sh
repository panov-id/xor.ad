#!/usr/bin/env bash
# Ночной бэкап запускается целиком на подставных docker и curl и обязан выгрузить дамп.
#
#   scripts/check-backup-script.sh
#
# Зачем. С 12.09.2026 по 15.09.2026 relay/wizard/backup-postgres.sh не делал дампа:
# коммит 96b49cc вставил комментарий посреди команды после переноса `\`, и
# `docker compose exec … postgres` уходил без команды, а pg_dump шёл отдельно на
# хосте. `bash -n` синтаксис пропускал, а проба в relay/wizard/test_wizard.py
# читала текст скрипта и не запускала его. Нашла финальная панель ревью (OPS-1).
# Здесь скрипт исполняется по-настоящему — подменены только внешние команды.
#
# Проверяется двумя сторонами:
#   живой скрипт   pg_dump вызван ВНУТРИ docker compose exec, дамп выгружен, код 0
#   сломанная копия  тот же комментарий посреди команды — проба обязана увидеть падение;
#                  без этого случая «зелёный» ничего бы не доказывал
#
# Коды выхода: 0 — скрипт делает дамп и поломка видна; 1 — не делает или поломка
# не видна; 2 — не с чего начать (нет скрипта).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
script="${BACKUP_SCRIPT:-$root/relay/wizard/backup-postgres.sh}"
[ -f "$script" ] || { echo "нет скрипта: $script" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/compose"
calls="$work/calls.log"

cat > "$work/compose/backup.env" <<'EOF'
BUNNY_STORAGE_ZONE=probe-zone
BUNNY_STORAGE_KEY=probe-key
BUNNY_STORAGE_HOST=storage.example.invalid
POSTGRES_PASSWORD=probe-password
DATABASES=relay_prod
EOF

# docker: записывает свои аргументы; если среди них pg_dump — отдаёт «дамп» больше 512 байт.
cat > "$work/bin/docker" <<EOF
#!/usr/bin/env bash
printf 'docker %s\n' "\$*" >> "$calls"
case " \$* " in
  *" pg_dump "*) head -c 4096 /dev/urandom ;;  # несжимаемо: gzip -9 не ужмёт ниже 512 байт
  *) exit 1 ;;
esac
EOF
# curl: записывает аргументы; на листинг отвечает пустым массивом, иначе молча успех.
cat > "$work/bin/curl" <<EOF
#!/usr/bin/env bash
printf 'curl %s\n' "\$*" >> "$calls"
case " \$* " in *" PUT "*|*" DELETE "*) ;; *) printf '[]' ;; esac
EOF
# pg_dump на «хосте» — ровно та ошибка, которую ловим: его здесь быть не должно.
cat > "$work/bin/pg_dump" <<EOF
#!/usr/bin/env bash
printf 'HOST pg_dump %s\n' "\$*" >> "$calls"
exit 127
EOF
chmod +x "$work/bin/"*

run_copy() {  # run_copy <файл скрипта> → код выхода
  : > "$calls"
  RELAY_COMPOSE_DIR="$work/compose" PATH="$work/bin:$PATH" TMPDIR="$work" \
    bash "$1" > "$work/out.log" 2>&1
}

failures=0
run_copy "$script"; code=$?
if [ "$code" = 0 ] && grep -q '^docker .*compose exec .*postgres .*pg_dump ' "$calls" \
   && ! grep -q '^HOST pg_dump' "$calls" && grep -q 'uploaded relay_prod' "$work/out.log"; then
  printf '  ✓ живой скрипт: pg_dump внутри docker compose exec, дамп выгружен\n'
else
  failures=$((failures + 1))
  printf '  ✗ живой скрипт не сделал дампа (код %s)\n' "$code"
  sed 's/^/      | /' "$calls" "$work/out.log" | tail -8
fi

# Сломанная копия: вернуть комментарий между переносом и pg_dump, как в 96b49cc.
python3 - "$script" "$work/broken.sh" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
# По образцу, а не буквально: отступ команды менялся (21.09.2026 её завернули в
# функцию, и четыре пробела стали шестью), и буквальный поиск перестал находить
# место поломки. Проба это сказала вслух — ниже, — а не промолчала.
pattern = re.compile(r'(postgres \\\n)([ \t]*)(pg_dump)')
match = pattern.search(text)
if not match:
    sys.exit("в скрипте не найдена команда дампа — проба не может сломать копию")
indent = match.group(2)
broken = text[:match.start()] + match.group(1) + indent + "# комментарий посреди команды\n" \
         + indent + match.group(3) + text[match.end():]
open(dst, "w", encoding="utf-8").write(broken)
PY
[ -f "$work/broken.sh" ] || { failures=$((failures + 1)); echo "  ✗ сломанную копию собрать не удалось"; }
if [ -f "$work/broken.sh" ]; then
  run_copy "$work/broken.sh"; code=$?
  if [ "$code" != 0 ] && ! grep -q 'uploaded relay_prod' "$work/out.log"; then
    printf '  ✓ сломанная копия падает без выгрузки (код %s) — поломка видна\n' "$code"
  else
    failures=$((failures + 1))
    printf '  ✗ сломанная копия прошла (код %s) — проба не отличает поломку\n' "$code"
  fi
fi

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: 2 — ПРОВАЛОВ: %s\n' "$failures"; exit 1; fi
printf 'случаев: 2 — ночной бэкап делает дамп, и поломка команды видна\n'
