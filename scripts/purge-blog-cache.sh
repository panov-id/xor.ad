#!/usr/bin/env bash
# Чистит кеш зоны, с которой отдаётся сайт с блогом.
#
# Зачем отдельный скрипт. Кеш чистит выкат, последним шагом, — но шаг перед ним
# отказался удалять из хранилища файлы, которых нет в сборке, и упал; очистка
# кеша после него оказалась пропущена. Файлы при этом уже залиты: страница поста
# отдаётся свежая, а список постов — из кеша, то есть старый. Пока причина не
# устранена, кеш чистится руками, и делать это надо скриптом, а не наугад.
#
#   scripts/purge-blog-cache.sh            # найти зону и почистить
#   scripts/purge-blog-cache.sh --list     # только показать зоны, ничего не делать
#
# Ключ берётся из deploy/.env.deploy — того же файла, что и остальной выкат.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
set -a; . "$ROOT_DIR/deploy/.env.deploy" 2>/dev/null; set +a

[ -n "${BUNNY_API_KEY:-}" ] || { echo "нет BUNNY_API_KEY в deploy/.env.deploy" >&2; exit 2; }

MODE="${1:-purge}"

python3 - "$BUNNY_API_KEY" "$MODE" <<'PY'
import json
import sys
import urllib.error
import urllib.request

key, mode = sys.argv[1], sys.argv[2]
API = "https://api.bunny.net"


def call(path: str, method: str = "GET"):
    request = urllib.request.Request(
        f"{API}{path}", method=method,
        headers={"AccessKey": key, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode() or "{}"
            return response.status, json.loads(body) if body.strip().startswith(("{", "[")) else body
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()[:200]


status, zones = call("/pullzone")
if status != 200 or not isinstance(zones, list):
    print(f"не удалось получить список зон: HTTP {status}", file=sys.stderr)
    sys.exit(1)

# Зона сайта опознаётся по ТОЧНОМУ хостнейму, а не по вхождению подстроки.
#
# Первая версия искала «panov» в имени зоны и хостнеймах, исключая «xor», «sosed»,
# «neighbro». Она зацепила боевую зону API: одно её имя содержит «xor», зато один
# из хостнеймов — «api.relay.panov.id» — содержит «panov» и не содержит ничего из
# списка исключений, а условие срабатывало по любому совпадению. Кеш боевой зоны
# был почищен без всякой нужды. Ничего не сломалось, но подстрока в списке из
# двадцати трёх зон — это не отбор, а лотерея.
SITE_HOSTNAMES = {"panov.id", "www.panov.id"}


def looks_like_site(zone: dict) -> bool:
    hostnames = {h.get("Value", "") for h in zone.get("Hostnames", [])}
    return bool(hostnames & SITE_HOSTNAMES)


candidates = [z for z in zones if looks_like_site(z)]

if mode == "--list" or not candidates:
    print(f"зон всего: {len(zones)}")
    for zone in zones:
        hosts = ", ".join(h.get("Value", "") for h in zone.get("Hostnames", []))
        mark = "→" if zone in candidates else " "
        print(f" {mark} {zone.get('Id'):>9}  {zone.get('Name',''):<28} {hosts[:70]}")
    sys.exit(0 if mode == "--list" else 1)

for zone in candidates:
    zone_id, name = zone.get("Id"), zone.get("Name", "")
    status, body = call(f"/pullzone/{zone_id}/purgeCache", method="POST")
    verdict = "кеш почищен" if status in (200, 204) else f"ОТКАЗ: HTTP {status} {body}"
    print(f"{name} (id {zone_id}): {verdict}")
PY
