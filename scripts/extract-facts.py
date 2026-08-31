#!/usr/bin/env python3
"""Вытащить из комплекта документов кандидатов в факты.

    scripts/extract-facts.py [--out КАТАЛОГ]

Это не источник истины, а разведка: скрипт читает все документы трёх
репозиториев группы и раскладывает то, что похоже на факт, по типам. Реестры
пишутся руками на основе этого вывода — извлечение эвристическое и врать умеет.

Зачем вообще. 170 файлов, 33 тысячи строк, один и тот же факт записан в двух
языках и до трёх репозиториев. Панель ревью 31.08.2026 нашла девять расхождений,
из которых ни одно не ловилось двенадцатью существующими проверками, и все девять
лежали открытым текстом. Значит дело не в поиске, а в том, что факт нигде не
записан один раз.
"""
import argparse
import pathlib
import re
import sys
from collections import Counter, defaultdict

GROUP = pathlib.Path(__file__).resolve().parent.parent.parent
REPOS = ("xor.ad", "sosed.place", "neighbro.place")

# Дата. Глаголы перед ней ловить нельзя: первая версия этого скрипта держала
# список из семнадцати русских и тринадцати английских глаголов и объявила, что
# даты разошлись почти в каждой паре витрин. Проверка одного файла показала, что
# разошлись не документы, а список: английская половина пишет «was created on» и
# «settled», которых в нём не было. Фактом является сама дата, поэтому берём все
# даты обоих форматов, а глагол — лишь часть контекста.
DATE_RU = re.compile(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b")
DATE_EN = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")

# Английская половина пишет дату и словами: «12 August 2026», «5 Aug 2027»,
# «August 12, 2026». Первая версия знала только ISO и потому объявила
# расхождением все четыре места, где EN пишет по-человечески: в AUDIT, в двух
# документах DSA и в архиве чужого договора. Ни одно расхождением не было —
# документы совпадали, слеп был скрипт. В английских половинах таких дат 16
# против 981 в ISO: зона узкая, но она давала все ложные находки до одной.
MONTHS = {name: number for number, group in enumerate(
    (("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"),
     ("may",), ("june", "jun"), ("july", "jul"), ("august", "aug"),
     ("september", "sep", "sept"), ("october", "oct"), ("november", "nov"),
     ("december", "dec")), start=1) for name in group}
MONTH_NAMES = "|".join(sorted(MONTHS, key=len, reverse=True))
DATE_EN_DMY = re.compile(rf"\b(\d{{1,2}})\s+({MONTH_NAMES})\.?\s+(20\d{{2}})\b", re.I)
DATE_EN_MDY = re.compile(rf"\b({MONTH_NAMES})\.?\s+(\d{{1,2}}),?\s+(20\d{{2}})\b", re.I)

# И русская половина пишет словами ровно там же: «до 5 августа 2027», «Снимок на
# 7 июля 2026». Научив скрипт только английским словам, я получил те же пять
# мест с обратным знаком — «есть только в EN». Слепота была симметричной, и
# половинчатая правка её не лечит, а переворачивает.
MONTHS_RU = {name: number for number, group in enumerate(
    (("января",), ("февраля",), ("марта",), ("апреля",), ("мая",), ("июня",),
     ("июля",), ("августа",), ("сентября",), ("октября",), ("ноября",),
     ("декабря",)), start=1) for name in group}
MONTH_NAMES_RU = "|".join(MONTHS_RU)
DATE_RU_WORDS = re.compile(rf"\b(\d{{1,2}})\s+({MONTH_NAMES_RU})\s+(20\d{{2}})\b")

# Предмет решения: жирный заголовок в начале строки или пункта.
SUBJECT = re.compile(r"\*\*(.+?)\*\*")

OPEN_RU = re.compile(r"^\s*-\s*\[ \]|Открытый пункт|открытым пунктом|ещё нет\b|не сделан")
OPEN_EN = re.compile(r"^\s*-\s*\[ \]|Open item|as an open item|does not exist yet|not (yet )?done")

CREATE_TABLE = re.compile(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)")
COLUMN = re.compile(r"^\s{2}(\w+)\s+([a-z][a-z0-9 ()\[\]]*?)(?:\s{2,}|,|$)")
INDEX = re.compile(r"CREATE (?:UNIQUE )?INDEX (\w+) ON (\w+)")

# Число с единицей — кандидат в предел. Проценты и годы отсекаем: первых слишком
# много и они почти всегда про доли, вторые это даты.
UNIT = re.compile(
    r"\b(\d[\d\s]*(?:[.,]\d+)?)\s*(метр\w*|м\b|км\b|секунд\w*|сек\b|минут\w*|мин\b|часов|часа|час\b|"
    r"суток|дней|дня|байт\w*|КБ|МБ|символ\w*|графем\w*|metres?|m\b|km\b|seconds?|minutes?|hours?|days?|bytes?|KB|MB|characters?|chars?|graphemes?)")

def docs_of(repo):
    root = GROUP / repo / "docs"
    if not root.is_dir():
        return []
    # Симлинки отбрасываем: витрины подключены к гейту ими, и файл посчитался бы дважды.
    return sorted(p for p in root.rglob("*.md") if not p.is_symlink())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None, help="куда положить черновые реестры")
    args = parser.parse_args()

    decisions, opens, tables, columns, indexes, numbers = [], [], [], [], [], []
    per_repo = Counter()

    for repo in REPOS:
        for path in docs_of(repo):
            rel = f"{repo}/{path.relative_to(GROUP / repo)}"
            half = "RU" if path.name.endswith("_RU.md") else "EN" if path.name.endswith("_EN.md") else "-"
            per_repo[repo] += 1
            current_table = None
            lines = path.read_text(errors="replace").splitlines()

            # Дата, разорванную переносом строки, построчный разбор не видит:
            # «designated by the Council of Ministers on 2 February\n2024» — это
            # 2 февраля 2024, но «2 February» и «2024» лежат в разных строках, и
            # скрипт объявлял её расхождением с русской половиной, где она в одну
            # строку поместилась. Поэтому словесные даты ищутся ещё раз по паре
            # соседних строк, и берутся только те, что границу пересекают —
            # найденные внутри одной строки уже посчитаны выше.
            for index in range(len(lines) - 1):
                joined = lines[index] + " " + lines[index + 1]
                edge = len(lines[index])
                for pattern, order in ((DATE_EN_DMY, "dmy"), (DATE_EN_MDY, "mdy"),
                                       (DATE_RU_WORDS, "ru")):
                    for match in pattern.finditer(joined):
                        if match.start() >= edge or match.end() <= edge:
                            continue
                        first, second, year = match.groups()
                        if order == "ru":
                            day, month = first, MONTHS_RU[second]
                        else:
                            day, name = (first, second) if order == "dmy" else (second, first)
                            month = MONTHS[name.lower().rstrip(".")]
                        decisions.append((f"{year}-{month:02d}-{int(day):02d}", repo, rel,
                                          index + 1, half, ""))

            for number, line in enumerate(lines, 1):
                for match in DATE_RU.finditer(line):
                    day, month, year = match.groups()
                    subject = SUBJECT.search(line)
                    decisions.append((f"{year}-{month}-{day}", repo, rel, number, half,
                                      subject.group(1)[:80] if subject else ""))
                for match in DATE_RU_WORDS.finditer(line):
                    day, name, year = match.groups()
                    subject = SUBJECT.search(line)
                    decisions.append((f"{year}-{MONTHS_RU[name]:02d}-{int(day):02d}",
                                      repo, rel, number, half,
                                      subject.group(1)[:80] if subject else ""))
                for match in DATE_EN.finditer(line):
                    year, month, day = match.groups()
                    subject = SUBJECT.search(line)
                    decisions.append((f"{year}-{month}-{day}", repo, rel, number, half,
                                      subject.group(1)[:80] if subject else ""))
                for pattern, order in ((DATE_EN_DMY, "dmy"), (DATE_EN_MDY, "mdy")):
                    for match in pattern.finditer(line):
                        first, second, year = match.groups()
                        day, name = (first, second) if order == "dmy" else (second, first)
                        subject = SUBJECT.search(line)
                        decisions.append((f"{year}-{MONTHS[name.lower().rstrip('.')]:02d}-{int(day):02d}",
                                          repo, rel, number, half,
                                          subject.group(1)[:80] if subject else ""))
                if (OPEN_RU if half == "RU" else OPEN_EN).search(line):
                    opens.append((repo, rel, number, half, line.strip()[:110]))
                found = CREATE_TABLE.search(line)
                if found:
                    current_table = found.group(1)
                    tables.append((repo, rel, number, half, current_table))
                elif current_table and line.startswith(");"):
                    current_table = None
                elif current_table:
                    column = COLUMN.match(line)
                    if column:
                        columns.append((repo, rel, half, current_table, column.group(1), column.group(2).strip()))
                found = INDEX.search(line)
                if found:
                    indexes.append((repo, rel, number, half, found.group(1), found.group(2)))
                for match in UNIT.finditer(line):
                    numbers.append((repo, rel, number, half,
                                    match.group(1).replace(" ", ""), match.group(2)))

    print("ФАЙЛОВ ПРОЧИТАНО")
    for repo in REPOS:
        print(f"  {repo:16} {per_repo[repo]}")
    print(f"\nКАНДИДАТЫ В ФАКТЫ")
    print(f"  датированных решений   {len(decisions):5}   уникальных дат: {len({d[0] for d in decisions})}")
    print(f"  открытых пунктов       {len(opens):5}")
    print(f"  объявлений таблиц      {len(tables):5}   уникальных имён: {len({t[4] for t in tables})}")
    print(f"  колонок                {len(columns):5}")
    print(f"  индексов               {len(indexes):5}")
    print(f"  чисел с единицами      {len(numbers):5}   различных пар: {len({(n[4], n[5]) for n in numbers})}")

    # Главное, ради чего всё: где половины разошлись по датам одного предмета.
    by_half = defaultdict(lambda: defaultdict(set))
    for date, repo, rel, _number, half, _subject in decisions:
        if half == "-":
            continue
        stem = rel.replace("_RU.md", "").replace("_EN.md", "")
        by_half[stem][half].add(date)
    print("\nДАТЫ, КОТОРЫЕ ЕСТЬ В ОДНОЙ ПОЛОВИНЕ И НЕТ В ДРУГОЙ")
    total = 0
    for stem in sorted(by_half):
        only_ru = by_half[stem]["RU"] - by_half[stem]["EN"]
        only_en = by_half[stem]["EN"] - by_half[stem]["RU"]
        if only_ru or only_en:
            total += len(only_ru) + len(only_en)
            print(f"  {stem}")
            if only_ru:
                print(f"      только RU: {', '.join(sorted(only_ru))}")
            if only_en:
                print(f"      только EN: {', '.join(sorted(only_en))}")
    print(f"  ИТОГО расхождений по датам: {total}")

    if args.out:
        out = pathlib.Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        def dump(name, rows, header):
            with (out / name).open("w") as handle:
                handle.write("\t".join(header) + "\n")
                for row in rows:
                    handle.write("\t".join(str(cell) for cell in row) + "\n")
            print(f"  записан {out / name}: {len(rows)} строк")
        print("\nЧЕРНОВЫЕ РЕЕСТРЫ")
        dump("decisions.raw.tsv", sorted(decisions), ("date", "repo", "file", "line", "half", "subject"))
        dump("open.raw.tsv", opens, ("repo", "file", "line", "half", "text"))
        dump("schema.raw.tsv", columns, ("repo", "file", "half", "table", "column", "type"))
        dump("indexes.raw.tsv", indexes, ("repo", "file", "line", "half", "index", "table"))
        dump("numbers.raw.tsv", numbers, ("repo", "file", "line", "half", "value", "unit"))
    return 0

if __name__ == "__main__":
    sys.exit(main())
