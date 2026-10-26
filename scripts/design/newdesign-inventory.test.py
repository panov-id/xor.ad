#!/usr/bin/env python3
"""Tests of scripts/design/newdesign-inventory.py: the archive's set of screen ids is read from the archive, so a
screen added to the mockups and not mapped, a mapped id the mockups dropped, and a missing code file each fail.

    python3 -I scripts/design/newdesign-inventory.test.py
"""
import importlib.util
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("inv", here / "newdesign-inventory.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

fails = 0


def check(name, ok, why):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f": {why}"))
    fails += 0 if ok else 1


ids = inv.screens()
check("every archive id is mapped, every mapped file exists", inv.problems(ids) == [], inv.problems(ids))
check("the archive has the 148 screens of 25.10 + 26.10", len(ids) == 148, f"{len(ids)} ids")
less = dict(inv.MAP); less.pop("table-over")
check("an unmapped archive id fails", any("table-over" in e for e in inv.problems(ids, less)), "a forgotten screen passes")
more = dict(inv.MAP); more["ghost"] = ("", "new")
check("a mapped id not in the archive fails", any("ghost" in e for e in inv.problems(ids, more)), "a dropped screen passes")
bad = dict(inv.MAP); bad["feed"] = ("app/src/screens/Nope.tsx", "keep")
check("a missing code file fails", any("Nope.tsx" in e for e in inv.problems(ids, bad)), "a wrong path passes")
check("every status is keep, change or new", {s for _, s in inv.MAP.values()} <= {"keep", "change", "new"},
      {s for _, s in inv.MAP.values()})
svg = inv.map_svg(ids)
check("the map draws one box per screen id", svg.count("<g data-id=") == len(ids), f"{svg.count('<g data-id=')} boxes")
check("every zone of the archive is a column of the map", {z for z, _, _ in ids.values()} == {z for z, _ in inv.ZONES},
      {z for z, _, _ in ids.values()} ^ {z for z, _ in inv.ZONES})
sys.exit(1 if fails else 0)
