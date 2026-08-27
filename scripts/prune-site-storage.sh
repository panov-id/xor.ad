#!/usr/bin/env bash
# Убирает из хранилища сайта файлы, которых сборка больше не производит.
#
# Зачем. Выкат сайта падает на шаге очистки: он сверяет содержимое хранилища со
# списком собранных файлов и отказывается удалять разницу, если её больше, чем
# публикуемого. Отказ — правильный: ровно так предохранитель спасает сайт, когда
# сборка вышла пустой. Но разница здесь настоящая: в хранилище лежат файлы
# прежней версии сайта, которых нынешняя сборка не делает. Пока они там, каждый
# выкат заканчивается ошибкой, а следующий за ним шаг — очистка кеша — не
# выполняется вовсе, и свежий индекс отдаётся из кеша старым.
#
#   scripts/prune-site-storage.sh            # показать разницу, ничего не трогая
#   scripts/prune-site-storage.sh --backup   # ещё и скачать лишнее в scratchpad
#   scripts/prune-site-storage.sh --apply    # скачать и удалить
#
# Удаление необратимо, поэтому копия снимается всегда, когда дело доходит до
# --apply: файл, которого нет в репозитории, восстановить будет неоткуда.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="${SITE_DIR:-$ROOT_DIR/../www.panov.id}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/site-storage-backup}"
# shellcheck disable=SC1091
set -a; . "$ROOT_DIR/deploy/.env.deploy" 2>/dev/null; set +a
[ -n "${BUNNY_API_KEY:-}" ] || { echo "нет BUNNY_API_KEY в deploy/.env.deploy" >&2; exit 2; }
[ -d "$SITE_DIR" ] || { echo "нет каталога сайта: $SITE_DIR" >&2; exit 2; }

python3 - "$BUNNY_API_KEY" "$SITE_DIR" "$BACKUP_DIR" "${1:-}" <<'PY'
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

key, site_dir, backup_dir, mode = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ZONE_HOSTNAME = "panov.id"


def api(path, method="GET", host="https://api.bunny.net", headers=None, data=None):
    request = urllib.request.Request(
        f"{host}{path}", method=method, data=data,
        headers=headers or {"AccessKey": key, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            text = raw.decode(errors="replace")
            # startswith, а не «первый символ в "{["»: у пустого файла срез пуст,
            # а пустая строка входит в любую — и json.loads("") падает на первом же
            # пустом css. Скачивание должно возвращать байты, что бы в них ни было.
            looks_like_json = text.lstrip().startswith(("{", "["))
            return response.status, (json.loads(text) if looks_like_json else raw)
    except urllib.error.HTTPError as error:
        return error.code, error.read()[:300]


# Хранилище берём не по имени, а через ту же зону, что отдаёт сайт: у зоны есть
# StorageZoneId, и это единственная связь, которую не надо угадывать.
status, zones = api("/pullzone")
zone = next((z for z in zones if any(h.get("Value") == ZONE_HOSTNAME for h in z.get("Hostnames", []))), None)
if not zone:
    sys.exit("зона сайта не найдена")
storage_id = zone.get("StorageZoneId")

status, storages = api("/storagezone")
storage = next((s for s in storages if s.get("Id") == storage_id), None)
if not storage:
    sys.exit(f"хранилище {storage_id} не найдено")

name = storage["Name"]
password = storage.get("Password")
region = storage.get("Region") or ""
base = f"https://{region.lower()}.storage.bunnycdn.com" if region and region.lower() != "de" else "https://storage.bunnycdn.com"
sheaders = {"AccessKey": password, "Accept": "application/json"}


def walk(prefix=""):
    status, items = api(f"/{name}/{prefix}", host=base, headers=sheaders)
    if status != 200 or not isinstance(items, list):
        sys.exit(f"не удалось прочитать «{prefix}»: HTTP {status}")
    for item in items:
        path = f"{prefix}{item['ObjectName']}"
        if item.get("IsDirectory"):
            yield from walk(f"{path}/")
        else:
            yield path


built = set()
site = pathlib.Path(site_dir)
for pattern in ("index.html", "styles.css", "feed.xml", "LICENSE", "README.md"):
    if (site / pattern).exists():
        built.add(pattern)
for path in site.rglob("*"):
    if path.is_file() and "blog" in path.parts and ".git" not in path.parts:
        built.add(str(path.relative_to(site)))

in_storage = set(walk())
stale = sorted(in_storage - built)

print(f"хранилище: {name}")
print(f"в хранилище файлов: {len(in_storage)}, собирается: {len(built)}, лишних: {len(stale)}")
for path in stale:
    print(f"  · {path}")

if mode not in ("--backup", "--apply") or not stale:
    if not stale:
        print("\nлишнего нет — выкат больше не должен спотыкаться")
    else:
        print("\n(показ) ничего не тронуто. --backup — скачать, --apply — скачать и удалить.")
    sys.exit(0)

os.makedirs(backup_dir, exist_ok=True)
saved = 0
for path in stale:
    status, body = api(f"/{name}/{path}", host=base, headers={"AccessKey": password})
    if status != 200:
        sys.exit(f"копия не снята для {path}: HTTP {status} — удалять нельзя")
    target = pathlib.Path(backup_dir) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body if isinstance(body, bytes) else json.dumps(body).encode())
    saved += 1
print(f"\nкопия снята: {saved} файлов → {backup_dir}")

if mode != "--apply":
    print("(--backup) удаление не выполнялось.")
    sys.exit(0)

deleted = 0
for path in stale:
    status, _ = api(f"/{name}/{path}", method="DELETE", host=base, headers={"AccessKey": password})
    mark = "удалён" if status in (200, 204) else f"ОТКАЗ HTTP {status}"
    print(f"  {path}: {mark}")
    deleted += 1 if status in (200, 204) else 0
print(f"\nудалено: {deleted} из {len(stale)}")
PY
