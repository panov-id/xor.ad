#!/usr/bin/env bash
# Что записано про образ среды — против того, что на узле работает.
#
#   scripts/check-node-images.sh
#
# 01.09.2026 панель уехала на dev, отрисовала причину снимка правильно и показала
# пустоту: узел был на sha-1e80441 от 31.08 и колонки не знал вовсе. Ни одна
# проверка этого не увидела и не могла — гейт подписей сверяет панель с
# миграцией, проба узла сверяет тип со списком, тесты сверяют поведение с
# картой. Все они читают репозиторий. Ни одна не спрашивает развёрнутый узел,
# что он на самом деле за сборка. Полчаса и целый заход с браузером ушли на то,
# что здесь занимает секунду.
#
# Ожидание берётся из environments.toml — он в репозитории и отвечает на вопрос
# «что должно быть». Адреса берутся из inventory.toml, которого в репозитории
# нет намеренно (там ssh-хосты и списки адресов). Без него гейт объявляет себя
# непроверенным вслух: молчаливый пропуск — это ложная зелень, а её тут и ловим.
#
# Красным считается только настоящее расхождение. Узел, который не ответил, и
# узел, который не сообщает свой образ, — не провал: сегодня таких три из
# четырёх, и гейт, красный всегда, перестают читать через неделю.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
environments="${NODE_IMAGES_ENVS:-$root/relay/wizard/environments.toml}"
inventory="${NODE_IMAGES_INVENTORY:-$root/relay/wizard/inventory.toml}"

[ -f "$environments" ] || { echo "нет файла сред: $environments" >&2; exit 2; }
if [ ! -f "$inventory" ]; then
  echo "нет $inventory — адреса узлов неоткуда взять, пул не опрошен"
  echo "(файл вне репозитория намеренно: в нём ssh-хосты и списки адресов)"
  exit 2
fi

python3 - "$environments" "$inventory" <<'PY'
import json
import sys
import tomllib
import urllib.error
import urllib.request

environments_path, inventory_path = sys.argv[1], sys.argv[2]
with open(environments_path, "rb") as handle:
    environments = tomllib.load(handle).get("env", {})
with open(inventory_path, "rb") as handle:
    inventory = tomllib.load(handle)

zone = inventory.get("pool", {}).get("dns_zone")
if not zone:
    sys.exit("в inventory не объявлена dns_zone — имя узла не собрать")

matched = mismatched = silent = unreachable = 0


def health(host):
    request = urllib.request.Request(f"https://{host}/health",
                                     headers={"accept": "application/json"})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read())


for box in inventory.get("box", []):
    box_id = box.get("id")
    for env in box.get("envs", []):
        expected = environments.get(env, {}).get("image_tag")
        host = f"{box_id}-{env}.{zone}"
        label = f"{box_id}/{env}"

        if not expected:
            mismatched += 1
            print(f"  ✗ {label:<14} среды {env} нет в environments.toml — сверять не с чем")
            continue

        try:
            body = health(host)
        except (urllib.error.URLError, OSError, ValueError) as error:
            unreachable += 1
            # «Имени нет в DNS» и «узел не отвечает» — разные новости и разные
            # действия: первое значит, что бокс не доводили до dns, второе — что
            # заведённый узел лежит. Свалить их в одно «не ответил» значит
            # спрятать вторую под первой, а лежащий узел заметить хочется.
            text = str(error)
            if "Name or service not known" in text or "nodename nor servname" in text:
                why = "имени нет в DNS — бокс не доведён до dns"
            elif "timed out" in text or "timeout" in text.lower():
                why = "не ответил вовремя"
            elif "Connection refused" in text:
                why = "соединение отклонено — узел лежит"
            else:
                why = f"недоступен ({text[:40]})"
            print(f"  · {label:<14} {why}")
            continue

        actual = body.get("image")
        if not actual:
            # Поле появилось 31.08.2026 (599ff11). Образ старше него честно не
            # умеет назвать себя, и это не расхождение, а немота — но её надо
            # видеть: пока она есть, среда не проверяема в принципе.
            silent += 1
            print(f"  · {label:<14} отвечает, но образ не сообщает — ждёт сборки новее 31.08.2026")
            continue

        if actual == expected:
            matched += 1
            print(f"  ✓ {label:<14} {actual}")
        else:
            mismatched += 1
            print(f"  ✗ {label:<14} работает {actual}, а записано {expected}")

print()
total = matched + mismatched + silent + unreachable
print(f"узлов в пуле: {total} · сошлось: {matched} · разошлось: {mismatched} · "
      f"без ответа: {unreachable} · молчат про образ: {silent}")

if mismatched:
    print("расхождение между записанным и работающим — выкат либо не делали, либо он не доехал")
    sys.exit(1)
if not matched:
    print("внимание: сверить не удалось ни один узел — это не зелёный результат")
PY
