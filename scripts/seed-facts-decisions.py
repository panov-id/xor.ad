#!/usr/bin/env python3
"""Черновик реестра решений: сопоставить датированные решения в парах документов.

    scripts/seed-facts-decisions.py [--write]

Решение здесь — строка с датой и жирным предметом. Половины пишут предмет на
своих языках, поэтому сопоставляются они не текстом, а датой и порядком: если
в обеих половинах решения с датой D идут в одинаковом числе и порядке, пара
однозначна. Всё остальное выносится в «нужны руки» — угадывать нельзя.

Зачем вообще пара. Сравнение множеств дат по файлу дефект не ловит: 31.08.2026
русская половина писала 28.08, английская 26.08, и обе даты и так встречались в
каждом файле по другим поводам. Ловит только сверка одного решения в двух местах.
"""
import argparse
import pathlib
import re
import sys
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
GROUP = ROOT.parent
PAIRS = [
    "xor.ad/docs/chat", "xor.ad/docs/protocol", "xor.ad/docs/dsa/SPEC",
    "xor.ad/docs/offers/SPEC", "xor.ad/docs/app-prototype-spec",
    "xor.ad/docs/design-system-app", "xor.ad/docs/test-map",
]
DATE_RU = re.compile(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b")
DATE_EN = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
# Жирный предмет переносится по ширине абзаца ровно так же, как дата: «**Автоповтора
# не будет — решено\n10.08.2026.**» — это один предмет, разорванный переводом строки.
# Без re.S регулярка его не видит, и половина, где перенос лёг иначе, оказывается
# «без решения». Длину ограничиваем: без предела точка через re.S съедает абзацы
# целиком и объявляет предметом решения три предложения подряд.
BOLD = re.compile(r"\*\*(.{1,160}?)\*\*", re.S)

def decisions_of(path, half):
    """Строки с датой и жирным предметом, по порядку появления.

    Предмет ищется не в строке, а в окне из трёх строк вокруг даты. Абзацы в
    документах свёрнуты по ширине, и жирный предмет то и дело оказывается строкой
    выше или ниже своей даты. Пока окна не было, скрипт объявлял «нужны руки» там,
    где половины совпадали: protocol 28.08.2026 читался как «RU 0, EN 1» только
    потому, что в русской половине **шесть** перенеслось на следующую строку.
    Проверено 31.08.2026: все десять таких случаев оказались вёрсткой абзаца.
    """
    lines = path.read_text().splitlines()
    found = []
    for number, line in enumerate(lines, 1):
        dates = ([f"{y}-{m}-{d}" for d, m, y in DATE_RU.findall(line)] if half == "RU"
                 else [f"{y}-{m}-{d}" for y, m, d in DATE_EN.findall(line)])
        if not dates:
            continue
        # Предмет ищется в абзаце, а не в окне из N строк. Окно казалось достаточным,
        # пока не нашлась пара, где половины свёрнуты по-разному: в русской жирный лёг
        # строкой выше даты, в английской — двумя, и окно из трёх строк достало его
        # только с одной стороны. Абзац — естественная граница: решение и его дата
        # живут в одном пункте списка, и ширина свёртки на это не влияет.
        start = number - 1
        while start > 0 and lines[start - 1].strip():
            start -= 1
        end = number
        while end < len(lines) and lines[end].strip():
            end += 1
        paragraph = "\n".join(lines[start:end])
        bold = BOLD.search(paragraph)
        if not bold:
            continue
        for date in dates:
            found.append((date, number, " ".join(bold.group(1).split())))
    return found

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="записать docs/facts/decisions.tsv")
    args = parser.parse_args()

    rows, manual = [], []
    for stem in PAIRS:
        ru_path, en_path = GROUP / f"{stem}_RU.md", GROUP / f"{stem}_EN.md"
        if not (ru_path.exists() and en_path.exists()):
            print(f"  пропуск {stem}: пары нет", file=sys.stderr)
            continue
        ru, en = decisions_of(ru_path, "RU"), decisions_of(en_path, "EN")
        by_date_ru, by_date_en = defaultdict(list), defaultdict(list)
        for item in ru:
            by_date_ru[item[0]].append(item)
        for item in en:
            by_date_en[item[0]].append(item)
        for date in sorted(set(by_date_ru) | set(by_date_en)):
            left, right = by_date_ru[date], by_date_en[date]
            if len(left) == len(right) and left:
                for (_, ru_line, ru_text), (_, en_line, en_text) in zip(left, right):
                    rows.append((f"{stem.split('/')[-1]}.{date}.{ru_line}", date,
                                 f"{stem}_RU.md:{ru_line}", f"{stem}_EN.md:{en_line}",
                                 ru_text[:70], en_text[:70]))
            else:
                manual.append((stem, date, len(left), len(right)))

    print(f"сопоставлено однозначно: {len(rows)}")
    print(f"нужны руки (число решений с этой датой в половинах разное): {len(manual)}")
    for stem, date, left, right in manual:
        print(f"  {stem} {date}: RU {left}, EN {right}")

    if args.write:
        out = ROOT / "docs/facts/decisions.tsv"
        with out.open("w") as handle:
            handle.write("# Решения: одно решение — одна строка, с якорем в обеих половинах.\n"
                         "#\n"
                         "# Засеяно scripts/seed-facts-decisions.py, проверяется\n"
                         "# scripts/check-facts-decisions.sh: дата в реестре обязана совпасть с\n"
                         "# датой на обеих строках-якорях, а якорь — существовать.\n"
                         "#\n"
                         "# Строки, которые скрипт сопоставить не смог, в реестр НЕ попадают:\n"
                         "# угаданная пара хуже отсутствующей.\n"
                         "#\n")
            handle.write("\t".join(("id", "date", "ru", "en", "subject_ru", "subject_en")) + "\n")
            for row in rows:
                handle.write("\t".join(row) + "\n")
        print(f"записан {out}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
