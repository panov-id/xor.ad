#!/usr/bin/env bash
# What the checklist promised by a date, and whether that date has passed.
#
#   scripts/due.sh            # overdue and the next fortnight
#   scripts/due.sh 60         # a wider window
#
# The dates were already written down. Nothing read them: J12 fell due on 19
# August and G11 on the 21st, and both survived only because the checklist
# happened to be re-read that morning. A deadline nobody queries is a note, not a
# deadline.
#
# Only open items count. A date inside a closed one is a record of when something
# was done, and reporting those would bury the two that matter.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WINDOW="${1:-14}"

python3 - "$WINDOW" "$ROOT_DIR/docs/open-work_RU.md" "$ROOT_DIR/docs/open-work_EN.md" <<'PY'
import datetime
import pathlib
import re
import sys

# Обе половины: срок, записанный только в английской, раньше был невидим —
# читался один русский файл, и форма «before 2026-09-01» не разбиралась вовсе.
window = int(sys.argv[1])
documents = [pathlib.Path(name) for name in sys.argv[2:]]
today = datetime.date.today()

missing = [d for d in documents if not d.exists()]
if missing:
    raise SystemExit("нет файла " + ", ".join(str(d) for d in missing))

lines = []
for document in documents:
    lines.extend(document.read_text(encoding="utf-8").splitlines())

# Items are the unit: a date belongs to the item it sits in, and only open items
# are asked about.
items = []
current = None
for number, line in enumerate(lines, start=1):
    started = re.match(r"^- \[( |x)\] \*\*([A-Za-z]+\d+)\.", line)
    if started:
        current = {"open": started.group(1) == " ", "code": started.group(2),
                   "line": number, "title": line.strip()[:96], "text": []}
        items.append(current)
    elif current is not None and line.startswith("## "):
        current = None
    if current is not None:
        current["text"].append(line)

# A deadline is a date somebody promised to act by. Most dates in this checklist
# are the opposite — «Решено 07.08.2026», «Проверено 17.08.2026» — records of
# something already done. The first version of this script read them all and
# reported six overdue items of which five were decisions; a warning that is
# mostly wrong is a warning nobody reads.
DEADLINE = re.compile(
    r"\b(?:до|к|не позднее|before|by)\s+(?:(\d{2})\.(\d{2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2}))\b",
    re.IGNORECASE)

found = []
for item in items:
    if not item["open"]:
        continue
    for line in item["text"]:
        for day, month, year, iso_year, iso_month, iso_day in DEADLINE.findall(line):
            try:
                when = (datetime.date(int(year), int(month), int(day)) if year
                        else datetime.date(int(iso_year), int(iso_month), int(iso_day)))
            except ValueError:
                continue
            found.append((when, item))

if not found:
    print("в открытых пунктах нет ни одного срока («до <дата>»)")
    raise SystemExit(0)

# Один и тот же пункт есть в обеих половинах — показываем его один раз,
# по коду и дате, взяв заголовок той половины, которая встретилась первой.
def collapse(rows):
    seen = {}
    for when, item in rows:
        key = (when, item["code"])
        seen.setdefault(key, item["title"])
    return sorted((when, code, title) for (when, code), title in seen.items())

overdue = collapse((w, i) for w, i in found if w < today)
soon = collapse((w, i) for w, i in found
                if today <= w <= today + datetime.timedelta(days=window))
later = sorted({(w, i["code"]) for w, i in found if w > today + datetime.timedelta(days=window)})

print(f"сегодня {today:%d.%m.%Y}, окно {window} дней\n")

if overdue:
    print("ПРОСРОЧЕНО:")
    for when, code, title in overdue:
        print(f"  {when:%d.%m.%Y}  ({(today - when).days} дн. назад)  {title}")
    print()

if soon:
    print("БЛИЖАЙШЕЕ:")
    for when, code, title in soon:
        days = (when - today).days
        print(f"  {when:%d.%m.%Y}  ({'сегодня' if days == 0 else f'через {days} дн.'})  {title}")
    print()

if later:
    print(f"дальше окна: {', '.join(f'{c} — {w:%d.%m.%Y}' for w, c in later)}")

raise SystemExit(1 if overdue else 0)
PY
