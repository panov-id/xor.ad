#!/usr/bin/env python3
"""nd4-fonts.py: every face the mockups embed is written, every @font-face points at a file that exists,
and each family × weight covers Latin and Cyrillic (the app speaks both). Run inside Docker with fonttools, brotli."""
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nd4_fonts", HERE / "nd4-fonts.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

ok = 0
found = m.faces()
total = sum(len(v) for v in found.values())
css = m.OUT_CSS.read_text(encoding="utf-8")
urls = re.findall(r'url\("\./nd4-fonts/([^"]+)"\)', css)
assert len(urls) == total, f"css names {len(urls)} of {total} faces"
missing = [u for u in urls if not (m.OUT_DIR / u).is_file()]
assert not missing, f"files missing: {missing}"
ok += 1

for (fam, w), datas in found.items():
    cps = set().union(*(m.cmap_of(d) for d in datas))
    for ch in "AzЖя":
        assert ord(ch) in cps, f"{fam} {w} has no «{ch}»"
ok += 1

assert m.ranges([0x41, 0x42, 0x43, 0x45]) == "U+0041-0043, U+0045"
ok += 1
print(f"{ok} of 3 ok; faces {total}, families × weights {len(found)}")
