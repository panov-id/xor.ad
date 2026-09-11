#!/usr/bin/env python3
"""Черновик реестра решений: сопоставить датированные решения в парах документов.

    scripts/seed-facts-decisions.py            # показать, что нашлось
    scripts/seed-facts-decisions.py --propose  # напечатать недостающее строками TSV
    scripts/seed-facts-decisions.py --force    # переписать реестр целиком

Решение здесь — строка с датой и жирным предметом. Половины пишут предмет на
своих языках, поэтому сопоставляются они не текстом, а датой и порядком: если
в обеих половинах решения с датой D идут в одинаковом числе и порядке, пара
однозначна. Всё остальное выносится в «нужны руки» — угадывать нельзя.

Зачем вообще пара. Сравнение множеств дат по файлу дефект не ловит: 31.08.2026
русская половина писала 28.08, английская 26.08, и обе даты и так встречались в
каждом файле по другим поводам. Ловит только сверка одного решения в двух местах.

Почему в реестр он больше не пишет. До 07.09.2026 --write переписывал файл
целиком, и это тихо стирало всё, что заводилось руками: в тот день реестр из 93
сверенных решений превратился в 157 строк и 168 расхождений, а непокрытых дат
стало двенадцать вместо одной.

Дописывать недостающее вместо перезаписи не помогло бы: из 157 находок 128 в
реестре отсутствуют, и это не пропущенные решения, а мусор — «`Chats N`»,
«скользящий», обрывки жирного текста, стоящие рядом с датой по случайности.
Разница между 157 находками и 97 строками реестра — это работа человека, который
отобрал из черновика годное. Поэтому находки печатаются готовыми строками TSV, а
переносит их в реестр человек. Единственная запись — --force, полная пересборка с
нуля: она называет вслух, сколько отобранного исчезнет.
"""
import argparse
import os
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

HEADER = ("id", "date", "ru", "en", "subject_ru", "subject_en")
PREAMBLE = ("# Решения: одно решение — одна строка, с якорем в обеих половинах.\n"
            "#\n"
            "# Засеяно scripts/seed-facts-decisions.py, проверяется\n"
            "# scripts/check-facts-decisions.sh: дата в реестре обязана совпасть с\n"
            "# датой на обеих строках-якорях, а якорь — существовать.\n"
            "#\n"
            "# Строки, которые скрипт сопоставить не смог, в реестр НЕ попадают:\n"
            "# угаданная пара хуже отсутствующей. Заведённое руками скрипт не трогает:\n"
            "# он печатает кандидатов по --propose, а переносит их сюда человек.\n"
            "#\n")


def read_registry(path):
    """Реестр как он лежит: шапка, заголовок, строки по порядку и id → строка."""
    if not path.exists():
        return PREAMBLE, list(HEADER), [], {}
    preamble, header, body = "", None, []
    for line in path.read_text(encoding="utf-8").splitlines(keepends=True):
        if header is None and (not line.strip() or line.startswith("#")):
            preamble += line
            continue
        cells = line.rstrip("\n").split("\t")
        if header is None:
            header = cells
            continue
        if cells and cells[0]:
            body.append(cells)
    return preamble or PREAMBLE, header or list(HEADER), body, {row[0]: row for row in body}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--propose", action="store_true",
                        help="напечатать строками TSV то, чего в реестре нет")
    parser.add_argument("--write", action="store_true",
                        help=argparse.SUPPRESS)  # был перезаписью реестра; см. шапку
    parser.add_argument("--force", action="store_true",
                        help="переписать реестр целиком, потеряв всё заведённое руками")
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

    out = pathlib.Path(os.environ.get("FACTS_DECISIONS") or ROOT / "docs/facts/decisions.tsv")
    preamble, header, body, by_id = read_registry(out)
    fresh = [row for row in rows if row[0] not in by_id]
    print(f"в реестре: {len(body)}; из найденного нет в реестре: {len(fresh)}")

    if args.force:
        # Полная перезапись имеет одно законное применение — пересобрать реестр с
        # нуля. Её цена называется вслух: всё, чего скрипт не видит, исчезает.
        lost = [row for row in body if row[0] not in {r[0] for r in rows}]
        print(f"перезапись потеряет строк, заведённых не этим скриптом: {len(lost)}")
        for row in lost[:10]:
            print(f"  − {row[0]}")
        if len(lost) > 10:
            print(f"  … и ещё {len(lost) - 10}")
        with out.open("w", encoding="utf-8") as handle:
            handle.write(PREAMBLE)
            handle.write("\t".join(HEADER) + "\n")
            for row in rows:
                handle.write("\t".join(row) + "\n")
        print(f"переписан {out}: строк {len(rows)}")
        return 0

    if args.write:
        # Имя осталось, чтобы старый вызов не сработал молча: он ждал записи, а
        # запись здесь и была дефектом.
        print("--write больше не пишет в реестр: он стирал заведённое руками.")
        print("напечатать кандидатов — --propose, пересобрать реестр с нуля — --force")
        return 2

    if args.propose:
        if not fresh:
            print("предлагать нечего")
            return 0
        print(f"\n# кандидаты: {len(fresh)}. Годное переносит человек — черновик")
        print("# находит и обрывки жирного текста, оказавшиеся рядом с датой.")
        for row in fresh:
            print("\t".join(row))
    return 0

if __name__ == "__main__":
    sys.exit(main())
