#!/usr/bin/env python3
"""Rename class words inside className strings of app/src/**/*.tsx (whole words only, other words kept).

Usage: class-rename.py old=new [old=new ...]   «new» may hold several words (k-note+k-error → "k-note k-error"); old= drops the word.
Prints per file the renames made; a test or style is not touched (CSS goes by css-drop-class.py).
"""
import re, sys
from pathlib import Path


def main() -> int:
    pairs = dict(a.split("=", 1) for a in sys.argv[1:])
    total = 0
    for f in sorted(Path("app/src").rglob("*.tsx")):
        t = f.read_text(); n = 0

        def fix(m):
            nonlocal n
            words = m.group(2).split(" ")
            out = []
            for w in words:
                if w in pairs: out.extend(x for x in pairs[w].split("+") if x); n += 1
                else: out.append(w)
            return m.group(1) + " ".join(out) + m.group(3)
        new = re.sub(r'(className=\{?[`"])([^`"]*)([`"])', fix, t)
        if n: f.write_text(new); print(f"{f}: {n}"); total += n
    print(f"class-rename: {total} words renamed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
