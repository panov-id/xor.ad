#!/usr/bin/env python3
"""A walk's text for a person to read: screens with their visible text, the screen-reader-only lines,
no control lists, no repeated option lists (languages, radii, modes), consecutive duplicates folded.
   python3 scripts/textwalk/read.py walk.txt [--from N] [--to M]   (N, M: step numbers)"""
import re, sys

NOISE = {"100 м", "300 м", "1 км", "3 км", "10 км", "радиус круга", "Azərbaycanca", "Беларуская", "Deutsch",
         "Ελληνικά", "English", "Español", "Français", "Հայերեն", "ქართული", "Қазақша", "Кыргызча", "Polski",
         "Română", "Русский", "Тоҷикӣ", "Українська", "Oʻzbekcha", "10 минут", "30 минут", "час", "пока говорим",
         "один", "компанией", "вечеринка"}
args = sys.argv[1:]
path = args[0]
lo = int(args[args.index("--from") + 1]) if "--from" in args else 1
hi = int(args[args.index("--to") + 1]) if "--to" in args else 10**9
step, prev = 0, None
for line in open(path, encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("## "):
        step += 1
    if not (lo <= step <= hi):
        continue
    if line.startswith("  controls:") or line.startswith("  ход ") or line.startswith("  ! ") or not line.strip():
        continue
    m = re.match(r"  \| (.*)", line)
    if m and m.group(1).strip() in NOISE:
        continue
    if line == prev:
        continue
    print(line[:160]); prev = line
