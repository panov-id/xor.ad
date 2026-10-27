#!/usr/bin/env python3
"""Drop every selector that names a class prefix (e.g. fd-) from CSS files; a rule left with no selector goes whole.

Brace-aware (rules inside @media stay in their block; an @media left empty goes). Comments outside rules are kept.
Usage: css-drop-class.py <prefix-|name,name,...> <file.css>...   A word ending in «-» is a prefix (fd-), else exact class
names (splash,poster). Prints per file: rules dropped, selectors dropped, and how many mentions are left.
"""
import re, sys


def split_top(css: str):
    """Yield (prelude, body, is_block) at this nesting level; plain text between rules comes as (text, None, False)."""
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0: yield css[i:], None, False; return
        # a comment holding a brace is not expected in these files; keep it simple
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == "{": depth += 1
            elif css[k] == "}": depth -= 1
            k += 1
        yield css[i:j], css[j + 1:k - 1], True
        i = k


def clean(css: str, pat, stats) -> str:
    out = []
    for pre, body, block in split_top(css):
        if not block: out.append(pre); continue
        lead = re.match(r"\s*(?:/\*.*?\*/\s*)*", pre, re.S).group(0)
        sel = pre[len(lead):]
        if sel.strip().startswith("@"):
            inner = clean(body, pat, stats)
            if inner.strip() == "" or not re.search(r"\{", inner) and "@media" in sel: stats[0] += 1; out.append(lead); continue
            out.append(f"{lead}{sel}{{{inner}}}"); continue
        parts = [p for p in sel.split(",")]
        keep = [p for p in parts if not pat.search(p)]
        stats[1] += len(parts) - len(keep)
        if not keep: stats[0] += 1; out.append(lead.rstrip(" ") if lead.strip() == "" else lead); continue
        out.append(f"{lead}{','.join(keep)}{{{body}}}")
    return "".join(out)


def main() -> int:
    what = sys.argv[1]
    pat = re.compile(r"\." + re.escape(what) + r"[a-zA-Z0-9_-]" if what.endswith("-")
                     else r"\.(?:" + "|".join(map(re.escape, what.split(","))) + r")(?![a-zA-Z0-9_-])")
    for f in sys.argv[2:]:
        stats = [0, 0]
        t = open(f).read()
        new = re.sub(r"\n{3,}", "\n\n", clean(t, pat, stats))
        open(f, "w").write(new)
        print(f"{f}: {stats[0]} rules dropped, {stats[1]} selectors dropped, {len(pat.findall(new))} left")
    return 0


if __name__ == "__main__":
    sys.exit(main())
