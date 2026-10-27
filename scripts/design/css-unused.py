#!/usr/bin/env python3
"""Class names that the CSS defines under given prefixes and no app/src code names (className, a class string, a selector).

Usage: css-unused.py <prefix,prefix,...> <file.css>...   Prints the unused names, comma-joined, for css-drop-class.py.
A name counts as used when it appears as a whole word in any .ts/.tsx under app/src (template strings included).
A name a template string may build at run time (`k-tone-${t}` builds every k-tone-*) is never given as unused: it is
named on stderr as «built at run time», for a person to look at.
"""
import re, sys
from pathlib import Path


def main() -> int:
    prefixes = sys.argv[1].split(",")
    defined = set()
    for f in sys.argv[2:]:
        for m in re.finditer(r"\.((?:" + "|".join(map(re.escape, prefixes)) + r")[a-zA-Z0-9_-]*)", Path(f).read_text()):
            defined.add(m.group(1))
    code = "\n".join(p.read_text() for p in Path("app/src").rglob("*.ts*"))
    stems = set(re.findall(r"(?<![a-zA-Z0-9_-])([a-zA-Z][a-zA-Z0-9_-]*)\$\{", code))
    unseen = sorted(n for n in defined if not re.search(r"(?<![a-zA-Z0-9_-])" + re.escape(n) + r"(?![a-zA-Z0-9_-])", code))
    built = [n for n in unseen if any(n.startswith(s) and len(n) > len(s) for s in stems)]
    unused = [n for n in unseen if n not in built]
    print(",".join(unused))
    print(f"css-unused: {len(unused)} of {len(defined)} defined names unused", file=sys.stderr)
    if built: print(f"css-unused: built at run time, kept: {','.join(built)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
