#!/usr/bin/env python3
"""Перевести время подписанной части контракта в unix-секунды.

    scripts/unix-time-in-contract.py [--check]

Зачем. Протокол §1 говорит прямо: «Время: unix-секунды, UTC. Часовых поясов в
протоколе нет нигде». Контракт при этом держал 21 поле `format: date-time` и ровно
одно поле в unix-секундах — `FeedItem.created_at`. То есть на одном экране клиенту
приезжали два представления времени сразу, и терминалу `depth` пришлось бы разбирать
оба (панель ревью 20.09.2026, линза «Протоколы»).

Граница правки — та же, что у самого §1: протокол, а не всё, что лежит в файле.
Кабинет заведения (`/adv/*`, cookie `__Host-adv`) — браузерная поверхность для
человека, протоколом не описанная; его шесть полей — `Venue.verified_at`,
`OfferCreate.discount_until` и четыре у `AdvOffer` — остаются в ISO сознательно.

Коды выхода: 0 — сошлось или переведено; 1 — с --check найдено непереведённое.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = ROOT / "docs/api/openapi.yaml"

# Схемы кабинета заведения: их время протокол не описывает и трогать нечего.
CABINET = ("Venue", "OfferCreate", "AdvOffer")

# Единица пишется форматом, а не припиской к описанию. Описания у этих полей уже
# есть и не у всех закавычены: приписка перед незакавыченным текстом с запятой
# разрезала бы его на два ключа — ровно тот дефект, который сегодня же пришлось
# чинить в 33 местах. `format` в OpenAPI 3.1 — открытая строка, и своё имя единицы
# в ней законно; что оно значит, сказано в §1 протокола и в info.description.
ISO = "type: string, format: date-time"
UNIX = "type: integer, format: unix-seconds"


def cabinet_lines(text):
    """Номера строк, лежащих внутри схем кабинета."""
    inside = set()
    current = None
    for number, line in enumerate(text.splitlines(), start=1):
        if (m := re.match(r"^    ([A-Za-z0-9_]+):\s*$", line)):
            current = m.group(1)
        elif re.match(r"^  \S", line):
            current = None
        if current in CABINET:
            inside.add(number)
    return inside


def convert(line):
    return line.replace(ISO, UNIX)


def main():
    check = "--check" in sys.argv[1:]
    text = SPEC.read_text(encoding="utf-8")
    skip = cabinet_lines(text)
    lines = text.splitlines(keepends=True)

    left, changed = [], 0
    for number, line in enumerate(lines, start=1):
        if "format: date-time" not in line:
            continue
        if number in skip:
            continue
        if check:
            left.append((number, line.strip()[:90]))
            continue
        new = convert(line)
        if new != line:
            lines[number - 1] = new
            changed += 1

    if check:
        for number, body in left:
            print(f"  ✗ строка {number}: время протокола в ISO, а не в unix-секундах — {body}")
        print(f"\nполей в ISO вне кабинета: {len(left)}")
        return 1 if left else 0

    SPEC.write_text("".join(lines), encoding="utf-8")
    print(f"переведено строк: {changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
