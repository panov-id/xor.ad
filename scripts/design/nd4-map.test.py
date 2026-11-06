#!/usr/bin/env python3
"""Tests for nd4-map.py. Run: python3 -I scripts/design/nd4-map.test.py"""
import importlib.util, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("nd4map", os.path.join(HERE, "nd4-map.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

d = m.build()
text = m.render(d, "EN")
ru = m.render(d, "RU")
fails = []


def check(name, ok, info=""):
    if not ok:
        fails.append("FAIL %s %s" % (name, info))


# 283 rows in the screens table
rows = re.findall(r"^\| (\d+) \| [^|]+ \| (\d+) \| ", text.split("## Screens")[1], re.M)
check("283 rows", len(rows) == 283, "got %d" % len(rows))
check("rows 1..283 in order", [int(r[0]) for r in rows] == list(range(1, 284)))
# place-map family: 23..29, base 23
fam = {d["ids"][j][0]: [d["ids"][i][0] for i in mem] for j, mem in d["fam"].items()}
check("place-map = 23..29 base 23", fam.get(23) == list(range(23, 30)), str(fam.get(23)))
# colors: #2a2926 -> --text
check("#2a2926 -> --text", d["tok"].get("#2a2926") == "--text", str(d["tok"].get("#2a2926")))
check("#2a2926 row in table", "| #2a2926 | --text |" in text)
# ready used comes from the first lines of the generated files, read here on their own: whole apart from parts, nothing credited
whole, parts = set(), set()
for dirpath, _, fs in os.walk(os.path.join(m.ROOT, "app/src")):
    for f in fs:
        if f.endswith(".gen.tsx"):
            first = open(os.path.join(dirpath, f), encoding="utf-8").readline()
            if first.startswith("// generated from docs/newdesign4/") and " screen" in first:
                fam = re.search(r"\(family [\w-]+: ([\d, ]+)\)", first)
                if fam:
                    whole |= {int(x) for x in re.findall(r"\d+", fam[1])}
                else:
                    parts |= {int(x) for x in re.findall(r"\d+", re.sub(r"\([^)]*\)", "", first.split(".html", 1)[1].split(" by scripts")[0]))}
parts -= whole
num_of = [x[0] for x in d["ids"]]
got_whole = {num_of[i] for i, k in d["kind_of"].items() if k == "whole"}
got_parts = {num_of[i] for i, k in d["kind_of"].items() if k == "part"}
check("whole screens = the family numbers of the headers", got_whole == whole, str(sorted(got_whole ^ whole)))
check("parts = the other numbers of the headers", got_parts == parts, str(sorted(got_parts ^ parts)))
check("a family member no header names is not credited (24)", 23 not in d["kind_of"] or d["kind_of"][23] == "hand", str(d["kind_of"].get(23)))
check("a header without a family counts as a part (79, 283)", {79, 283} <= got_parts, str(sorted(got_parts)))
check("the header reader", m.read_header("// generated from docs/newdesign4/k/kypros-phone.html screens 51, 53 (the hand), 59 (the mode's icons) by scripts/design/x") == (set(), {51, 53, 59})
      and m.read_header("// generated from docs/newdesign4/k/kypros-phone.html screen 23 (family place-map: 23, 29) by scripts/design/x") == ({23, 29}, set())
      and m.read_header("// The splash, taken from docs/newdesign4 screen 01") is None)
check("i18n.ts names no screen", not [f for f in d["appf"].values() if f.endswith("i18n.ts")])
check("the intro gives whole and parts of 283", ("Ready used of 283: whole screens %d, parts of screens %d" % (len(whole), len(parts))) in text)
# EN/RU same numbers
nums = lambda s: re.findall(r"\d+", "\n".join(l for l in s.split("\n") if l.startswith("|")))
check("EN/RU same tables", nums(text) == nums(ru))
check("line 1", text.split("\n")[0] == m.HEAD and ru.split("\n")[0] == m.HEAD)
row23 = [l for l in text.split("\n") if "| 23 " in l]
check("screen 23 maps to the phone family file, not the nav", bool(row23) and "place-map.gen.tsx" in row23[0] and "nav-laptop" not in row23[0], str(row23[:1]))
import subprocess
check("the committed MAP pair equals the render (--check)", subprocess.run([sys.executable, "-I", m.ROOT + "/scripts/design/nd4-map.py", "--check"], capture_output=True).returncode == 0)
if fails:
    print("\n".join(fails)); sys.exit(1)
print("OK")
