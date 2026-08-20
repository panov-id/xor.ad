#!/usr/bin/env bash
# RU/EN pairs: same structure, and the same numbers.
#
#   scripts/check-docs-pairing.sh              # весь комплект
#   scripts/check-docs-pairing.sh docs/a_RU.md # только эти пары
#
# Имя и контракт заданы хуком: guard-commit.sh зовёт именно
# scripts/check-docs-pairing.sh, передаёт имена staged-файлов и ищет в выводе
# слово MISMATCH. Скрипт с другим именем хук молча не находит — и проверка,
# которую никто не вызывает, не проверка.
#
# The pairing check already counted sections and items, and on 2026-08-17 it said
# both versions matched — while the English one had been calling the feed check
# synchronous for weeks and the Russian one had not. Counts agreed; meaning did
# not.
#
# Numbers are the part of meaning a script can hold: a limit, a deadline, a
# threshold, a date. If one version says 256 and the other says 128, one of them
# is lying to whoever reads only that one. This does not read prose — it lines up
# the figures and shows where they disagree.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT_DIR" "$@" <<'PY'
import collections
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
# Файлы, названные хуком: сверяем только их пары. Без аргументов — весь комплект.
requested = {pathlib.Path(name).name for name in sys.argv[2:]}

# Figures worth comparing, and the shapes they take in these documents.
# Order matters: the longest shapes first, or 19.08.2026 is read as «19.08» plus
# «2026» and every date turns into two figures that disagree across languages.
NUMBER = re.compile(
    r"\b\d{2}\.\d{2}\.\d{4}\b"        # 19.08.2026
    r"|\b\d{4}-\d{2}-\d{2}\b"          # 2026-08-19
    r"|\b\d+\s*(?:КБ|МБ|ГБ|KB|MB|GB)\b"  # 41 КБ / 41 KB
    r"|\b\d{1,4}[:.]\d{2}\b"           # 4:20
    r"|\b\d+\b"
)

# The same size written in two alphabets is the same size.
UNITS = {"КБ": "KB", "МБ": "MB", "ГБ": "GB"}
# Noise is cut out of the line rather than the line out of the comparison: a URL
# in the Russian sentence and none in the English one made «236 КБ» look like a
# figure only the English version had.
NOISE = re.compile(r"https?://\S+|`[^`]*`|[0-9a-f]{7,}|\b\S+\.(?:woff2|js|css|mjs|jpg|png|svg|sh|py)\b")

# Only figures distinctive enough to carry a decision. A bare 5 is written «5» in
# one language and "five" in the other often enough that comparing them reports
# translation style, not disagreement — and a check that is permanently red is a
# check nobody reads. So: dates, times, sizes, and anything from three digits up.
DISTINCTIVE = re.compile(r"\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|[:.]|KB|MB|GB|^\d{3,}$")

def figures(path):
    counts = collections.Counter()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = NOISE.sub(" ", line)
        for match in NUMBER.finditer(line):
            figure = match.group(0)
            for russian, english in UNITS.items():
                figure = figure.replace(russian, english)
            figure = re.sub(r"\s+", " ", figure)
            if DISTINCTIVE.search(figure):
                counts[figure] += 1
    return counts

pairs = []
for russian in sorted((root / "docs").rglob("*_RU.md")):
    english = russian.with_name(russian.name.replace("_RU.md", "_EN.md"))
    if not english.exists():
        continue
    if requested and russian.name not in requested and english.name not in requested:
        continue
    pairs.append((russian, english))

if not pairs:
    print("нет пар для проверки")
    raise SystemExit(0)

problems = 0
for russian, english in pairs:
    # Множества, а не количества. Упомянуть 500 дважды в одной версии и один раз
    # в другой — это по-разному построенная фраза, а не расхождение. Значение
    # имеет число, которое одна версия называет, а вторая не называет вовсе.
    ru, en = set(figures(russian)), set(figures(english))
    only_ru = {k: 1 for k in ru - en}
    only_en = {k: 1 for k in en - ru}
    # Dates legitimately differ in form (19.08.2026 vs 2026-08-19), so a figure
    # missing on one side is only interesting when it is not a date.
    date = re.compile(r"^\d{4}-\d{2}-\d{2}$|^\d{2}\.\d{2}\.\d{4}$")
    only_ru = {k: v for k, v in only_ru.items() if not date.match(k)}
    only_en = {k: v for k, v in only_en.items() if not date.match(k)}

    if not only_ru and not only_en:
        print(f"  ✓ {russian.stem[:-3]:<24} числа сходятся")
        continue

    problems += 1
    print(f"  MISMATCH {russian.stem[:-3]}")
    if only_ru:
        print(f"      только в RU: {', '.join(sorted(only_ru)[:12])}")
    if only_en:
        print(f"      только в EN: {', '.join(sorted(only_en)[:12])}")

print()
if problems:
    print(f"пар с расхождением по числам: {problems}", file=sys.stderr)
    print("Число, которое есть в одной версии и нет в другой, — это либо перевод,", file=sys.stderr)
    print("который отстал, либо решение, записанное только на одном языке.", file=sys.stderr)
    raise SystemExit(1)
print(f"пар проверено: {len(pairs)} — числа сходятся во всех")
PY
