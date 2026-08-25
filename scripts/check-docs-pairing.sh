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
# Сравнение по хвосту пути, а не по одному имени: CHECKLIST_RU.md есть и в dsa/,
# и в offers/, и по имени хук просил одну пару, а получал обе.
requested = [pathlib.Path(name).as_posix() for name in sys.argv[2:]]

# Месяц словом — обе половины пишут даты так, и без этого «5 Aug 2027» оставляет
# голое «2027», которого нет в русском «05.08.2027». Русские месяцы здесь по той
# же причине: исключить только английские значило бы поменять одно ложное
# расхождение на другое — «5 августа 2026» против исключённого «5 August 2026».
MONTH = (r"(?:January|February|March|April|May|June|July|August|September|"
         r"October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|"
         r"Oct|Nov|Dec"
         r"|январ[ья]|феврал[ья]|марта|март|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|"
         r"августа|август|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])")

# Figures worth comparing, and the shapes they take in these documents.
# Order matters: the longest shapes first, or 19.08.2026 is read as «19.08» plus
# «2026» and every date turns into two figures that disagree across languages.
NUMBER = re.compile(
    r"\b\d{2}\.\d{2}\.\d{4}\b"        # 19.08.2026
    r"|\b\d{4}-\d{2}-\d{2}\b"          # 2026-08-19
    rf"|\b\d{{1,2}}\s+{MONTH}\s+\d{{4}}\b"   # 5 Aug 2027
    rf"|\b{MONTH}\s+\d{{1,2}},?\s+\d{{4}}\b" # Aug 5, 2027
    r"|\b\d+\s*(?:КБ|МБ|ГБ|KB|MB|GB)\b"  # 41 КБ / 41 KB
    r"|\b\d{1,4}[:.]\d{2}\b"           # 4:20
    # Без закрывающей границы: «$400m» — это те же 400, что и «$400 млн», а с
    # \b на конце цифры, слипшиеся с буквой, не находились вовсе, и число
    # выглядело как имеющееся только в русской половине.
    r"|\b\d+"
)

# The same size written in two alphabets is the same size.
UNITS = {"КБ": "KB", "МБ": "MB", "ГБ": "GB"}
# Noise is cut out of the text rather than the text out of the comparison: a URL
# in the Russian sentence and none in the English one made «236 КБ» look like a
# figure only the English version had.
#
# Cut from the whole document, not line by line. An inline code span that wraps
# across a line — `{shieldZoneId,\nmodel}` in deployment_EN.md — left one half of
# the backticks on each line, so the stripping ate the wrong stretch and let the
# `202` inside the next span through as a bare figure. The pair agreed; the
# reading of it did not.
FENCE = re.compile(r"^[ \t]*```.*$", re.MULTILINE)
NOISE = re.compile(r"https?://\S+|`[^`]*`|[0-9a-f]{7,}|\b\S+\.(?:woff2|js|css|mjs|jpg|png|svg|sh|py)\b")

# Only figures distinctive enough to carry a decision. A bare 5 is written «5» in
# one language and "five" in the other often enough that comparing them reports
# translation style, not disagreement — and a check that is permanently red is a
# check nobody reads. So: dates, times, sizes, and anything from three digits up.
DISTINCTIVE = re.compile(r"\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|[:.]|KB|MB|GB|^\d{3,}$"
                         rf"|^\d{{1,2}} {MONTH} \d{{4}}$|^{MONTH} \d{{1,2}},? \d{{4}}$")

MONTH_NUMBER = {}
for index, names in enumerate((
    ("january", "jan", "январь", "января"),
    ("february", "feb", "февраль", "февраля"),
    ("march", "mar", "март", "марта"),
    ("april", "apr", "апрель", "апреля"),
    ("may", "май", "мая"),
    ("june", "jun", "июнь", "июня"),
    ("july", "jul", "июль", "июля"),
    ("august", "aug", "август", "августа"),
    ("september", "sep", "sept", "сентябрь", "сентября"),
    ("october", "oct", "октябрь", "октября"),
    ("november", "nov", "ноябрь", "ноября"),
    ("december", "dec", "декабрь", "декабря"),
), start=1):
    for name in names:
        MONTH_NUMBER[name] = index


def canonical(figure):
    """One shape for a date, whichever half wrote it.

    Dates used to be dropped from the comparison outright, because 19.08.2026 and
    2026-08-19 are the same day written twice. Dropping them meant a date that
    genuinely drifted between the halves — a deadline moved in one language only —
    was the one kind of disagreement this check could never see. Measured: changing
    2026-08-20 to 2026-08-21 in one half was not reported. Now the four shapes are
    folded into one and compared like any other figure.
    """
    match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", figure)
    if match:
        return f"{match[3]}-{match[2]}-{match[1]}"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", figure):
        return figure
    match = re.fullmatch(r"(\d{1,2}) ([^\s]+) (\d{4})", figure)
    if match and match[2].lower() in MONTH_NUMBER:
        return f"{match[3]}-{MONTH_NUMBER[match[2].lower()]:02d}-{int(match[1]):02d}"
    match = re.fullmatch(r"([^\s]+) (\d{1,2}),? (\d{4})", figure)
    if match and match[1].lower() in MONTH_NUMBER:
        return f"{match[3]}-{MONTH_NUMBER[match[1].lower()]:02d}-{int(match[2]):02d}"
    return figure


def figures(path):
    counts = collections.Counter()
    raw = path.read_text(encoding="utf-8")
    # Чистка идёт по всему тексту, поэтому непарная обратная кавычка съедает всё
    # до следующей — молча и, возможно, вместе с числами. Молчания здесь быть не
    # должно: проверка, которая тихо перестала смотреть, хуже красной.
    # Заборы ограждённых блоков убираются ДО чистки. Иначе тройная кавычка
    # читается как парная плюс остаток, остаток склеивается со следующим забором,
    # и весь блок кода исчезает из сверки вместе со схемами, запросами и
    # замерами. Так и случилось 21.08.2026, когда чистка стала сплошной:
    # подмена измеренного числа внутри блока проверкой не замечалась.
    raw = FENCE.sub("", raw)
    if raw.count("`") % 2:
        print(f"  ! в {path.name} нечётное число обратных кавычек — "
              f"часть текста могла выпасть из сверки")
    text = NOISE.sub(" ", raw)
    for match in NUMBER.finditer(text):
        figure = match.group(0)
        for russian, english in UNITS.items():
            figure = figure.replace(russian, english)
        figure = re.sub(r"\s+", " ", figure)
        if DISTINCTIVE.search(figure):
            counts[canonical(figure)] += 1
    return counts

# Обход от корня репозитория, а не от docs/. Раньше сверялись только документы
# внутри docs/, и восемь пар из сорока семи — README репозитория и весь комплект
# relay/ (SPEC, ARCHITECTURE, HARDENING, RELEASE, MIGRATION_PLAN) — не проверялись
# вовсе: это спецификация узла и регламент релизов, живые части, а не архив.
# Симлинки на витрины отбрасываются, иначе их пары считались бы дважды.
SKIP = ("/node_modules/", "/.git/", "/dist/", "/build/")

def candidates():
    for path in sorted(root.rglob("*_RU.md")):
        text = path.as_posix()
        if any(part in text for part in SKIP):
            continue
        try:
            if any(parent.is_symlink() for parent in path.relative_to(root).parents
                   if (root / parent).exists()):
                continue
        except ValueError:
            continue
        yield path

pairs = []
matched_requests = set()
asymmetric = 0
for russian in candidates():
    english = russian.with_name(russian.name.replace("_RU.md", "_EN.md"))
    if not english.exists():
        continue
    if requested:
        # Совпадение по хвосту пути, но с проверкой однозначности: имя README_RU.md
        # совпадает с тремя разными парами, и раньше запрос одной сверял три чужие,
        # а саму запрошенную мог не тронуть.
        hits = [name for name in requested
                if russian.as_posix().endswith("/" + name) or english.as_posix().endswith("/" + name)
                or russian.as_posix().endswith(name) or english.as_posix().endswith(name)]
        if not hits:
            continue
        matched_requests.update(hits)
    # Пара может быть асимметричной осознанно: русская половина промптов Midjourney
    # делегирует к английской, потому что сами промпты по природе английские.
    # Такую пару пропускаем, но вслух — молчаливый пропуск ничем не отличается от
    # непроверенной пары.
    if any("pairing: asymmetric" in half.read_text(encoding="utf-8")
           for half in (russian, english)):
        print(f"  ~ {russian.stem[:-3]:<24} пара помечена асимметричной, числа не сверяются")
        asymmetric += 1
        continue

    pairs.append((russian, english))

if requested:
    missed = [name for name in requested if name not in matched_requests]
    if missed:
        # Молчаливый ноль здесь опаснее расхождения: хук ищет в выводе слово
        # MISMATCH, не находит и пропускает коммит как проверенный.
        print("НЕ НАЙДЕНО ПАР для: " + ", ".join(missed), file=sys.stderr)
        print("MISMATCH: запрошенный документ не попал в сверку", file=sys.stderr)
        raise SystemExit(1)

if not pairs:
    # Помеченная асимметричной пара — это принятое решение, а не пропущенная
    # проверка, и разница видна только здесь: хук зовёт скрипт с именами
    # staged-файлов, так что коммит одной такой пары приходил сюда с пустым
    # pairs и получал MISMATCH — отказ на ровном месте за то, что решение
    # записано (23.08.2026 маркер, 24.08.2026 отказ).
    if asymmetric:
        print(f"сверять нечего: пар помечено асимметричными — {asymmetric}")
        raise SystemExit(0)
    print("MISMATCH: нет пар для проверки", file=sys.stderr)
    raise SystemExit(1)

problems = 0
for russian, english in pairs:
    # Множества, а не количества. Упомянуть 500 дважды в одной версии и один раз
    # в другой — это по-разному построенная фраза, а не расхождение. Значение
    # имеет число, которое одна версия называет, а вторая не называет вовсе.
    ru, en = set(figures(russian)), set(figures(english))
    only_ru = {k: 1 for k in ru - en}
    only_en = {k: 1 for k in en - ru}
    # Dates are no longer dropped here. They used to be, because 19.08.2026 and
    # 2026-08-19 are one day written twice — but dropping them made a moved
    # deadline the single kind of drift this check could not see. canonical()
    # folds the four shapes into one instead, so a date is compared like any
    # other figure and only a genuine difference shows up.

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
