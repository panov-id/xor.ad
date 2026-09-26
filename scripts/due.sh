#!/usr/bin/env bash
# What the open registry promised by a date, and whether that date has passed.
#
#   scripts/due.sh            # overdue and the next fortnight
#   scripts/due.sh 60         # a wider window
#
# The dates were already written down. Nothing read them: J12 fell due on 19
# August and G11 on the 21st, and both survived only because the checklist
# happened to be re-read that morning. A deadline nobody queries is a note, not a
# deadline.
#
# Since 2026-09-26 the source is docs/facts/open.tsv (its `due` column), not the
# open-work checklist: that one is in docs/archive/ and no longer maintained.
# Only rows with a calendar date count; «сейчас», «с запуском» and «-» are not
# dates anybody can be late for.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WINDOW="${1:-14}"

python3 - "$WINDOW" "$ROOT_DIR/docs/facts/open.tsv" <<'PY'
import csv
import datetime
import pathlib
import sys

window = int(sys.argv[1])
registry = pathlib.Path(sys.argv[2])
today = datetime.date.today()

if not registry.exists():
    raise SystemExit(f"нет файла {registry}")

rows = [line for line in registry.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")]
reader = csv.DictReader(rows, delimiter="\t")

found = []
for row in reader:
    due = (row.get("due") or "").strip()
    try:
        when = datetime.date.fromisoformat(due)
    except ValueError:
        continue
    found.append((when, row["id"], (row.get("what") or "").strip()[:96]))

if not found:
    print("в реестре открытого нет ни одного срока датой")
    raise SystemExit(0)

found.sort()
overdue = [f for f in found if f[0] < today]
soon = [f for f in found if today <= f[0] <= today + datetime.timedelta(days=window)]
later = [f for f in found if f[0] > today + datetime.timedelta(days=window)]

print(f"сегодня {today:%d.%m.%Y}, окно {window} дней\n")

if overdue:
    print("ПРОСРОЧЕНО:")
    for when, code, title in overdue:
        print(f"  {when:%d.%m.%Y}  ({(today - when).days} дн. назад)  {code}. {title}")
    print()

if soon:
    print("БЛИЖАЙШЕЕ:")
    for when, code, title in soon:
        days = (when - today).days
        print(f"  {when:%d.%m.%Y}  ({'сегодня' if days == 0 else f'через {days} дн.'})  {code}. {title}")
    print()

if later:
    print(f"дальше окна: {', '.join(f'{c} — {w:%d.%m.%Y}' for w, c, _ in later)}")

raise SystemExit(1 if overdue else 0)
PY
