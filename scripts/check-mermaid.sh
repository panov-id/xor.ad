#!/usr/bin/env bash
# Проверяет, что каждая схема mermaid в документах разбирается парсером.
#
# Схемы правятся руками, а глазами их не проверить: незакрытая скобка или узел
# без кавычек ломают отрисовку молча — на GitHub вместо схемы остаётся серый
# блок, и документ врёт тем громче, чем важнее была картинка. Разбор идёт в
# контейнере: на хост ничего не ставится.
#
#   scripts/check-mermaid.sh [файл ...]     без аргументов — все docs/*.md
#
# Контейнеру подсовывается системный chromium: свой, из кэша puppeteer, в этом
# образе не запускается (spawn ENOENT при существующем файле), и гадать почему
# дешевле, чем указать рабочий путь.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE="${MERMAID_IMAGE:-minlag/mermaid-cli:latest}"

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  mapfile -t FILES < <(grep -rl '```mermaid' docs --include='*.md' | sort)
fi
[ ${#FILES[@]} -gt 0 ] || { echo "документов со схемами не найдено"; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# mktemp даёт 700, а контейнер бежит не от нас: без этого /data не читается.
chmod 755 "$WORK"

# Вырезаем блоки в отдельные файлы. Имя несёт документ и порядковый номер схемы
# внутри него, чтобы ошибка показывала, какую именно картинку чинить.
python3 - "$WORK" "${FILES[@]}" <<'PY'
import pathlib, sys
work = pathlib.Path(sys.argv[1])
for name in sys.argv[2:]:
    doc = pathlib.Path(name)
    block, number, inside = [], 0, False
    for line in doc.read_text(encoding="utf-8").splitlines():
        if line.strip() == "```mermaid":
            inside, block = True, []
            continue
        if inside and line.strip() == "```":
            number += 1
            (work / f"{doc.stem}--{number:02d}.mmd").write_text(
                "\n".join(block) + "\n", encoding="utf-8")
            inside = False
            continue
        if inside:
            block.append(line)
PY

printf '{"args":["--no-sandbox","--disable-dev-shm-usage"]}' > "$WORK/puppeteer.json"
chmod 644 "$WORK"/*.mmd "$WORK/puppeteer.json" 2>/dev/null
COUNT=$(ls "$WORK"/*.mmd 2>/dev/null | wc -l)
[ "$COUNT" -gt 0 ] || { echo "схем не найдено"; exit 2; }

docker run --rm -v "$WORK:/data" -w /data \
  -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  --entrypoint sh "$IMAGE" -c '
    PATH="/home/mermaidcli/node_modules/.bin:$PATH"
    fail=0
    for f in *.mmd; do
      if ! out=$(mmdc -q -p /data/puppeteer.json -i "$f" -o "/tmp/$f.svg" 2>&1); then
        echo "  ✗ $f"
        echo "$out" | grep -v "^Generating" | sed -n "1,6p" | sed "s/^/      /"
        fail=$((fail + 1))
      fi
    done
    echo
    if [ "$fail" -gt 0 ]; then
      echo "схем не разобралось: $fail" >&2
      exit 1
    fi
    echo "проверено схем: $(ls *.mmd | wc -l) — все разбираются"
  '
