#!/usr/bin/env python3
"""Взять в кавычки описания, которые YAML разрезал запятой на два ключа.

    scripts/fix-openapi-flow-descriptions.py [--check] [путь-к-yaml]

Зачем. В `docs/api/openapi.yaml` описания живут внутри однострочных flow-мэппингов
`{type: string, description: ..., x-description-ru: ...}`. Незакавыченный скаляр с
запятой внутри такого мэппинга YAML режет на два ключа: хвост описания становится
именем поля со значением null. Парсер не падает, ворота до 20.09.2026 ловили только
три формы хвоста (`).`, `true.`, `false.`), и 33 описания молча врали — вместе с ними
врала и страница API, собранная из этого же файла.

Правка механическая: хвост известен из разбора, поэтому пара «значение, хвост»
берётся в кавычки целиком. Двойные, а если в тексте есть двойная кавычка — одинарные.

Коды выхода: 0 — нечего чинить (или починено); 1 — с --check найдено порванное.
"""
import pathlib
import re
import sys

import yaml

DEFAULT = pathlib.Path(__file__).resolve().parent.parent / "docs/api/openapi.yaml"


def broken_keys(text):
    """Ключи, оканчивающиеся точкой: в OpenAPI таких имён не бывает — это хвост описания."""
    found = []

    class Loader(yaml.SafeLoader):
        pass

    def mapping(loader, node):
        for key_node, _ in node.value:
            if key_node.tag == "tag:yaml.org,2002:merge":
                continue
            key = loader.construct_object(key_node)
            # Точка в конце — хвост описания. Хвост с кавычкой на конце («…ПИНа."»)
            # появляется, когда разрезали уже закавыченное описание.
            if isinstance(key, str) and key.rstrip("\"'").endswith("."):
                found.append((key_node.start_mark.line + 1, key))
        return loader.construct_mapping(node)

    Loader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
    yaml.load(text, Loader=Loader)
    return found


def quote(value):
    return f"'{value}'" if '"' in value else f'"{value}"'


def repair(lines, line_no, tail):
    """Склеить `: голова, хвост` обратно в один закавыченный скаляр."""
    i = line_no - 1
    line = lines[i]
    # Голова описания сама бывает с запятой («Почта, роль, бренд и пермишены.»),
    # поэтому запятые в ней разрешены, а ключ сужен до двух имён описания — иначе
    # регулярка зацепилась бы за поле левее. Из нескольких совпадений берём правое:
    # оно и есть ближайший к хвосту ключ. Голова не имеет права перешагнуть
    # через соседний ключ `, x-description-ru:` — иначе левое описание проглотит правое.
    pattern = re.compile(
        r"(?P<key>\b(?:description|x-description-ru)):\s*"
        r"(?P<head>(?![\s\"'])(?:(?!,\s*[A-Za-z_-]+:\s)[^{}\[\]\n])*?),\s*"
        + re.escape(tail)
        + r"(?=\s*[,}])"
    )
    matches = list(pattern.finditer(line))
    if not matches:
        return False
    match = matches[-1]
    value = f"{match.group('head')}, {tail}"
    lines[i] = line[: match.start()] + f"{match.group('key')}: {quote(value)}" + line[match.end():]
    return True


def main():
    args = [a for a in sys.argv[1:] if a != "--check"]
    check = "--check" in sys.argv[1:]
    path = pathlib.Path(args[0]) if args else DEFAULT
    text = path.read_text(encoding="utf-8")
    found = broken_keys(text)
    if not found:
        print(f"{path.name}: порванных описаний нет")
        return 0
    if check:
        for line_no, tail in found:
            print(f"  ✗ строка {line_no}: описание разрезано, хвост стал ключом «{tail}»")
        print(f"\nпорванных описаний: {len(found)}")
        return 1

    # Порванных ключей на одной строке бывает два — английский и русский, — и починка
    # русского перекрывает английский целиком. Поэтому не «список из первого разбора»,
    # а круги: разобрать заново, починить, повторить, пока разбор не станет чистым.
    fixed, stuck = 0, []
    for _ in range(len(found) + 1):
        current = broken_keys(path.read_text(encoding="utf-8"))
        if not current:
            break
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        progress = False
        for line_no, tail in sorted(current, key=lambda pair: (-pair[0], -len(pair[1]))):
            if repair(lines, line_no, tail):
                fixed += 1
                progress = True
                break
        if not progress:
            stuck = current
            break
        path.write_text("".join(lines), encoding="utf-8")

    left = broken_keys(path.read_text(encoding="utf-8"))
    for line_no, tail in stuck:
        print(f"  ✗ строка {line_no}: не поддалось автоматической правке — «{tail}»")
    print(f"{path.name}: починено {fixed}, осталось {len(left)}")
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
