#!/usr/bin/env python3
"""Inventory of the newdesign4 archive against the app.

Reads the 283 screens of docs/newdesign4/kit/.../screens.csv and the old prototype
inventory docs/newdesign/inventory.csv (id -> code), and gives every screen a status:
  keep  - the id existed in the prototype, its code is known
  new   - the id is new in newdesign4
and every old id missing from newdesign4 a status:
  moved - merged into another screen (MOVED says where, from SCREENS_spec.md)
Any old id that is neither in newdesign4 nor in MOVED fails the run, so a forgotten
screen cannot slip by. Writes docs/newdesign4/inventory.csv; prints the counts.
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEW = ROOT / "docs/newdesign4/kit/sosed-design-2026-10-29/screens.csv"
OLD = ROOT / "docs/newdesign/inventory.csv"
OUT = ROOT / "docs/newdesign4/inventory.csv"

# SCREENS_spec.md «6 · Я · объединение» and «Правки по ревью (30.10)»
MOVED = {
    "edit-name": "me-profile",
    "edit-age": "me-profile",
    "age-filter": "me-visibility",
    "hidden": "me-visibility",
    "blocked": "me-visibility",
    "card": "card-in",  # spec says «= phrase», but phrase has no row in screens.csv
    "table": "checkers-turn",
    "table-wait": "checkers-wait",
    "table-over": "checkers-over",
    "cab-preview": "cab-new-offer",
    "feed": "nearby",
    "splash": "splash-lang",
}


def build(new_csv=NEW, old_csv=OLD):
    new = list(csv.DictReader(open(new_csv, encoding="utf-8")))
    old = {r["id"]: r["code"] for r in csv.DictReader(open(old_csv, encoding="utf-8"))}
    ids = {r["id"] for r in new}
    rows, errors = [], []
    for r in new:
        sid = r["id"]
        code = old.get(sid, "")
        if not code:
            code = next((old[o] for o, t in MOVED.items() if t == sid and o in old), "")
        rows.append({"n": r["№"], "id": sid, "title": r["экран"], "zone": r["зона"],
                     "status": "keep" if sid in old else "new", "code": code, "into": ""})
    for sid in sorted(set(old) - ids):
        into = MOVED.get(sid)
        if not into:
            errors.append(f"old screen {sid} is gone from newdesign4 and not in MOVED")
        elif into not in ids:
            errors.append(f"MOVED {sid} -> {into}: {into} is not a newdesign4 screen")
        rows.append({"n": "", "id": sid, "title": "", "zone": "", "status": "moved",
                     "code": old[sid], "into": into or ""})
    return rows, errors


def main():
    rows, errors = build()
    for e in errors:
        print("ERROR:", e)
    if errors:
        return 1
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    count = lambda s: sum(r["status"] == s for r in rows)
    total = count("keep") + count("new")
    print(f"screens {total}: keep {count('keep')}, new {count('new')}; old moved {count('moved')}")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
