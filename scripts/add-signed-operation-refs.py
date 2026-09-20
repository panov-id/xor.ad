#!/usr/bin/env python3
"""Дать каждой подписанной операции её 401 и три заголовка подписи.

    scripts/add-signed-operation-refs.py [--check]

Зачем. Протокол §2 требует подписи на 69 операциях контракта, а ответ 401 не
описывала ни одна из них (панель ревью 20.09.2026, линза «Протоколы»; пересчёт
ведущего: подписанных 69, с ответом 401 — ноль). Следствия два. Клиент, собранный
по контракту, не знает, что ловить на самом частом отказе подписанного API. И
собранный по контракту клиент шлёт `x-identity-sign` без `x-identity-session` и
`x-identity-time`: схема безопасности называет один заголовок из трёх, остальные
два лежат прозой в описании и в машинный вид не попадают вовсе.

Правка механическая и потому скриптом: `$ref` на общий ответ и на два параметра
ставится там, где его нет, отступами файла, не трогая ничего другого. Порядок
ответов сохраняется: 401 встаёт первым среди отказов, перед уже стоящими.

Коды выхода: 0 — сошлось или починено; 1 — с --check найдено неполное.
"""
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = ROOT / "docs/api/openapi.yaml"

UNAUTHORIZED = '"401": {$ref: "#/components/responses/Unauthorized"}'
SESSION = '{$ref: "#/components/parameters/IdentitySession"}'
TIME = '{$ref: "#/components/parameters/IdentityTime"}'
VERSION = '#/components/parameters/ProtocolVersion'
METHODS = ("get", "post", "put", "patch", "delete")


def signed_operations(spec):
    """(метод, путь) операций, которые протокол §2 велит подписывать."""
    found = set()
    for path, item in (spec.get("paths") or {}).items():
        for method in METHODS:
            op = (item or {}).get(method)
            if not op:
                continue
            if any("identitySignature" in entry for entry in op.get("security") or []):
                found.add((method, path))
    return found


def walk(lines):
    """Границы операций в сыром тексте: (метод, путь, первая строка, последняя)."""
    path = None
    current = None
    for number, line in enumerate(lines):
        if re.match(r"^  /\S*:\s*$", line):
            if current:
                yield (*current, number)
                current = None
            path = line.strip()[:-1]
        elif (m := re.match(r"^    (get|post|put|patch|delete):\s*$", line)) and path:
            if current:
                yield (*current, number)
            current = (m.group(1), path, number)
        elif re.match(r"^\S", line) and current:
            yield (*current, number)
            current, path = None, None
    if current:
        yield (*current, len(lines))


def main():
    check = "--check" in sys.argv[1:]
    text = SPEC.read_text(encoding="utf-8")
    spec = yaml.safe_load(text)
    signed = signed_operations(spec)
    lines = text.splitlines(keepends=True)

    missing_response, missing_headers = [], []
    inserts = []  # (номер строки, что вставить) — применяются снизу вверх
    for method, path, start, end in walk(lines):
        if (method, path) not in signed:
            continue
        body = "".join(lines[start:end])
        name = f"{method.upper()} {path}"

        if '"401"' not in body:
            missing_response.append(name)
            for number in range(start, end):
                if lines[number].strip() == "responses:":
                    indent = " " * (len(lines[number]) - len(lines[number].lstrip()) + 2)
                    inserts.append((number + 1, f"{indent}{UNAUTHORIZED}\n"))
                    break

        if SESSION not in body:
            missing_headers.append(name)
            for number in range(start, end):
                if VERSION in lines[number]:
                    indent = " " * (len(lines[number]) - len(lines[number].lstrip()))
                    inserts.append((number + 1, f"{indent}- {SESSION}\n{indent}- {TIME}\n"))
                    break

    if check:
        for name in missing_response:
            print(f"  ✗ {name}: подписана, а ответа 401 не описывает")
        for name in missing_headers:
            print(f"  ✗ {name}: подписана, а заголовков x-identity-session и x-identity-time не объявляет")
        total = len(missing_response) + len(missing_headers)
        print(f"\nподписанных операций: {len(signed)} — неполных: {total}")
        return 1 if total else 0

    for number, block in sorted(inserts, reverse=True):
        lines.insert(number, block)
    SPEC.write_text("".join(lines), encoding="utf-8")
    print(
        f"подписанных операций: {len(signed)}; дописано: 401 — {len(missing_response)}, "
        f"заголовков — {len(missing_headers)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
