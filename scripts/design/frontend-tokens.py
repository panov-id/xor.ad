#!/usr/bin/env python3
"""Tokens the designer's frontend kit (docs/newdesign3, <archive>/frontend/tokens.css, 28.10) adds over elements/tokens.css.

Appends to every :root[data-theme="<t>"] block of app/tokens/themes.css the names that block lacks, with the kit's values,
and the kit's :root names the app lacks into a :root block. Names both files have must agree (they did, 27 of 27 per theme).
Usage: frontend-tokens.py [archives dir] [tokens.css]   (defaults docs/newdesign3, docs/newdesign/proto/tokens.css, the file
proto-extract.py writes and app/tokens/themes.css copies verbatim: cp it after). Idempotent.
"""
import re, sys, zipfile
from pathlib import Path

THEMES = ["sea", "plum", "black", "white"]
root = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/newdesign3"); out = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/newdesign/proto/tokens.css")
z = next(root.glob("sosed-sea-*.zip"))
with zipfile.ZipFile(z) as f:
    kit = f.read(f"{z.stem}/frontend/tokens.css").decode()   # the same file in all four archives: it holds all four themes
pairs = lambda body: re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", body)
css = out.read_text()
added = 0
for t in THEMES:
    new = dict(pairs(re.search(r'\[data-theme="%s"\]\s*\{([^}]*)\}' % t, kit).group(1)))
    m = re.search(r'(:root\[data-theme="%s"\] \{)([\s\S]*?)(\n\})' % t, css)
    have = dict(pairs(m.group(2)))
    clash = [k for k in new if k in have and new[k].strip() != have[k].strip()]
    if clash: sys.exit(f"frontend-tokens: {t} disagrees with the kit on {clash}")
    extra = "".join(f"\n  {k}: {v.strip()};" for k, v in new.items() if k not in have)
    added += extra.count("\n")
    css = css[:m.end(2)] + extra + css[m.end(2):]
base = dict(pairs(re.search(r":root\s*\{([^}]*)\}", kit).group(1)))
if ":root { /* frontend kit */" not in css:
    css += ":root { /* frontend kit */" + "".join(f"\n  {k}: {v.strip()};" for k, v in base.items() if f"{k}:" not in css) + "\n}\n"
out.write_text(css)
# the kit's file as it came, for app/src/brands/sosed/theme.test.ts (its container sees app/, not docs/)
Path("app/tokens/kit-tokens.src.css").write_text(kit)
print(f"frontend-tokens: {added} theme tokens added to {out}")
