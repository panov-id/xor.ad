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
#
# Коды выхода: 0 — сверено и сошлось; 1 — расхождение; 2 — гейт не смог
# начать, нет файла сред или inventory; 3 — сверить не удалось ни одного
# узла. Третий отделён от первого нарочно: «узлы разошлись» и «сверять было
# нечего» требуют разных действий, а вызывающий скрипт читает код, не текст.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
environments="${NODE_IMAGES_ENVS:-$root/relay/wizard/environments.toml}"
inventory="${NODE_IMAGES_INVENTORY:-$root/relay/wizard/inventory.toml}"
# Вживую адрес пробы один и меняться не должен. Переменная нужна пробе ворот
# (scripts/test_check-node-images.sh): сети у неё нет, и без подмены адреса
# проверялись бы только отказные ветки, а главная — «сошлось» против
# «разошлось» — не исполнялась бы никогда и ломалась бы молча.
# Значение по умолчанию — отдельной переменной: в ${X:-https://{host}/health}
# bash закрывает подстановку на первой } — на той, что внутри {host}, — и
# приклеивает к значению хвост "/health}". Проба ворот на этом и покраснела.
default_health='https://{host}/health'
health_template="${NODE_IMAGES_HEALTH_TEMPLATE:-$default_health}"

[ -f "$environments" ] || { echo "нет файла сред: $environments" >&2; exit 2; }
if [ ! -f "$inventory" ]; then
  echo "нет $inventory — адреса узлов неоткуда взять, пул не опрошен"
  echo "(файл вне репозитория намеренно: в нём ssh-хосты и списки адресов)"
  exit 2
fi

python3 - "$environments" "$inventory" "$health_template" <<'PY'
import json
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request

environments_path, inventory_path, health_template = sys.argv[1:4]

# Должно совпадать с default_health в шапке скрипта: значение живёт в двух
# местах — bash подставляет его по умолчанию, python по нему узнаёт подмену.
DEFAULT_HEALTH = "https://{host}/health"


def fail_start(message):
    # Негодный шаблон — это отказ старта (код 2), а не приговор пулу. До правки
    # 02.09.2026 сломанная скобка читалась как «узел недоступен», а чужой ключ
    # вылетал KeyError и давал код 1 «расхождение — выкат не доехал».
    print(message, file=sys.stderr)
    raise SystemExit(2)


# Шаблон проверяется целиком и до первого запроса. Замер 01.09.2026: шаблон без
# {host} опрашивает ВСЕ боксы по одному адресу, и гейт объявляет пул сошедшимся,
# не спросив ни одного узла. Одна переменная окружения — и ложная зелень там,
# где весь смысл ворот в том, чтобы её не было.
if "{host}" not in health_template:
    fail_start("шаблон адреса без {host}: все узлы опрашивались бы по одному "
               f"адресу — NODE_IMAGES_HEALTH_TEMPLATE={health_template}")
try:
    sample = health_template.format(host="проба")
except (KeyError, IndexError, ValueError) as error:
    fail_start(f"шаблон адреса не разбирается ({error}) — "
               f"NODE_IMAGES_HEALTH_TEMPLATE={health_template}")
parsed = urllib.parse.urlsplit(sample)
if parsed.scheme != "https" and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
    fail_start(f"шаблон адреса не https и не локальный ({parsed.scheme}://{parsed.hostname}) — "
               "ответ узла по такому адресу подделывается кем угодно по дороге")
if health_template != DEFAULT_HEALTH:
    # Забытый export в профиле или в окружении CI не должен уводить опрос молча.
    print(f"  ! адрес пробы подменён: {health_template}")
with open(environments_path, "rb") as handle:
    environments = tomllib.load(handle).get("env", {})
with open(inventory_path, "rb") as handle:
    inventory = tomllib.load(handle)

zone = inventory.get("pool", {}).get("dns_zone")
if not zone:
    sys.exit("в inventory не объявлена dns_zone — имя узла не собрать")

matched = mismatched = silent = unreachable = planned = 0


def health(url):
    request = urllib.request.Request(url,
                                     headers={"accept": "application/json"})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read())


for box in inventory.get("box", []):
    box_id = box.get("id")
    # Без адреса бокса нет и машины: mode = "configure" означает, что визард её
    # не создаёт, а только настраивает уже существующую. Такая запись — намерение,
    # и спрашивать её по сети незачем: молчание заранее известно и ничего не значит.
    declared_only = not str(box.get("ssh_host", "")).strip()
    for env in box.get("envs", []):
        expected = environments.get(env, {}).get("image_tag")
        host = f"{box_id}-{env}.{zone}"
        label = f"{box_id}/{env}"

        if declared_only:
            planned += 1
            print(f"  · {label:<14} бокс объявлен, но не заведён: адреса нет ({box.get('provider')})")
            continue

        if not expected:
            mismatched += 1
            print(f"  ✗ {label:<14} среды {env} нет в environments.toml — сверять не с чем")
            continue

        # Адрес собирается ВНЕ try: ошибка шаблона не должна попадать в
        # обработчик, который трактует всё как «узел не ответил».
        url = health_template.format(host=host)
        try:
            body = health(url)
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
total = matched + mismatched + silent + unreachable + planned
print(f"записей в пуле: {total} · сошлось: {matched} · разошлось: {mismatched} · "
      f"без ответа: {unreachable} · молчат про образ: {silent} · не заведены: {planned}")

if mismatched:
    print("расхождение между записанным и работающим — выкат либо не делали, либо он не доехал")
    sys.exit(1)
if not matched:
    # Ноль сверенных — не успех, и код обязан это сказать: строку читает
    # человек, код читает вызывающий. Печать без кода уже дала бы зелень
    # ровно там, где не проверено ничего, — та самая ложная зелень.
    print("внимание: сверить не удалось ни один узел — это не зелёный результат")
    sys.exit(3)
PY
