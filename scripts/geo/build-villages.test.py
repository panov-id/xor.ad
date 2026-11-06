#!/usr/bin/env python3
"""Cases for build-villages.py: python3 -I scripts/geo/build-villages.test.py"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("v", Path(__file__).resolve().parent / "build-villages.py")
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)


def row(name, code="PPL", lat="34.7", lon="33.0", pop="0", alts="", klass="P"):
    f = [""] * 19
    f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[14] = name, name, alts, lat, lon, klass, code, pop
    return "\t".join(f)


got = V.build([row("Small"), row("Big", pop="500"), row("Ruin", code="PPLQ"), row("Hill", klass="T"),
               row("Limassol"), row("Small", lat="35.0")], [["Limassol", "CY", 34.7, 33.0, 100000]])
names = [r[0] for r in got]
assert names == ["Big", "Small"], f"expected the biggest first, no ruin, no hill, no known city, no repeat: {names}"
far = V.build([row("Limassol", lat="35.2")], [["Limassol", "CY", 34.7, 33.0, 100000]])
assert [r[0] for r in far] == ["Limassol"], "a same-named place far from the city must stay"
greek = V.build([row("Agros", alts="Agros2,Αγρός")], [])[0]
assert greek[5] == ["Αγρός"], f"the Greek name must be searchable: {greek}"
twice = V.build([row("Kato", lat="34.1", pop="10"), row("Kato", lat="35.1", pop="900"), row("Kato", lat="34.5", pop="5")], [])
assert len(twice) == 1 and twice[0][2] == 35.1 and twice[0][4] == 900, f"of one name the biggest place stays: {twice}"
print("build-villages: 4 of 4 cases OK")
