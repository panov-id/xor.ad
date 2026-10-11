#!/usr/bin/env python3
"""No Russian copies in the other languages' dictionaries (G-RU, 11.10.2026).

check-depth-i18n.sh catches a value left as an English copy; a value left as a Russian
copy passed it: on 11.10.2026 the 30 board.* keys of the terminal were Russian in all 15
other languages and every gate was green (TR1).

Two rules, over depth/ink/locales and web/src/locales:
  - a language not written in Cyrillic: any Cyrillic letter in a value is red;
  - a Cyrillic language (uk be kk ky tg): a value equal to Russian (and not to English) is
    red, unless the pair is listed in scripts/check-locale-ru-copies.allow — a word the
    language shares with Russian by right («км», «назад»).

  scripts/check-locale-ru-copies.py [--root DIR] [--baseline]

--baseline prints the allow lines for every current Cyrillic copy (to seed the list).
Exit: 0 clean, 1 on a copy, 2 on a broken tree."""
import json
import os
import re
import sys

CYRILLIC = {"ru", "uk", "be", "kk", "ky", "tg"}
CYR = re.compile(r"[Ѐ-ӿ]")
DIRS = (("depth", "depth/ink/locales"), ("web", "web/src/locales"))


def main():
    args = sys.argv[1:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if "--root" in args:
        root = args[args.index("--root") + 1]
    baseline = "--baseline" in args
    allow_path = os.path.join(root, "scripts", "check-locale-ru-copies.allow")
    allowed = set()
    if os.path.exists(allow_path):
        for line in open(allow_path, encoding="utf-8"):
            if line.strip() and not line.startswith("#"):
                allowed.add(tuple(line.rstrip("\n").split("\t")[:3]))
    bad, checked = [], 0
    for side, rel in DIRS:
        base = os.path.join(root, rel)
        try:
            ru = json.load(open(os.path.join(base, "ru.json"), encoding="utf-8"))
            en = json.load(open(os.path.join(base, "en.json"), encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"  ✗ {rel}: {e}", file=sys.stderr)
            return 2
        for name in sorted(os.listdir(base)):
            lang, ext = os.path.splitext(name)
            if ext != ".json" or lang in ("ru", "en"):
                continue
            checked += 1
            d = json.load(open(os.path.join(base, name), encoding="utf-8"))
            for k, v in d.items():
                v = str(v)
                if lang not in CYRILLIC:
                    if CYR.search(v):
                        bad.append(f"{lang}: {side} {k} has Cyrillic in a non-Cyrillic language: {v!r}")
                elif v == ru.get(k) and v != en.get(k) and CYR.search(v):
                    if baseline:
                        print(f"{lang}\t{side}\t{k}\tbaseline 11.10, not reviewed")
                    elif (lang, side, k) not in allowed:
                        bad.append(f"{lang}: {side} {k} is a copy of Russian: {v!r}"
                                   " (translate it, or list it in check-locale-ru-copies.allow with a reason)")
    if baseline:
        return 0
    for b in bad[:20]:
        print(f"  ✗ {b}")
    if len(bad) > 20:
        print(f"  … and {len(bad) - 20} more")
    if bad:
        print(f"Russian copies: {len(bad)}", file=sys.stderr)
        return 1
    print(f"no Russian copies: {checked} dictionaries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
