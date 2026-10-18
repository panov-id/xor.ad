#!/usr/bin/env python3
"""The app's own words (APP in app/src/i18n.ts): no key twice in a language, and every key the screens call is there.

  python3 -I scripts/design/app-i18n-keys.py [ROOT]     exit 0 clean, 1 a duplicate or a missing key

Called keys: say("app.…") and label("app.…") need the key in every language block; sayCount("app.…", n)
needs the plain key (the form a language does not write falls back to it), its .one/.few/… forms are
optional; say(`app.prefix.${x}`) needs at least one key under the prefix. The merge of day61-w2 and
day61-w4 (18.10.2026) gave two screens one key with two meanings — the second silently won in the object.
"""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[2])
src = root / "app/src"
lines = (src / "i18n.ts").read_text().splitlines()

blocks: dict[str, dict[str, int]] = {}
bad = 0
lang = None
for n, line in enumerate(lines, 1):
    m = re.match(r"^  ([a-z]{2}(?:-[A-Za-z]+)?): \{", line)
    if m:
        lang = m.group(1)
        blocks[lang] = {}
        continue
    if lang and re.match(r"^  \},?$", line):
        lang = None
        continue
    k = re.match(r'^\s+"([^"]+)":', line)
    if lang and k:
        key = k.group(1)
        if key in blocks[lang]:
            bad += 1
            print(f"DUPLICATE {lang} {key}: app/src/i18n.ts:{blocks[lang][key]} and :{n}")
        else:
            blocks[lang][key] = n
if not blocks:
    print("app-i18n-keys: SPOILED — no language block found in app/src/i18n.ts")
    sys.exit(2)

called: dict[str, str] = {}
for f in sorted(src.rglob("*.ts*")):
    if f.name == "i18n.ts" or ".test." in f.name:
        continue
    for n, line in enumerate(f.read_text().splitlines(), 1):
        at = f"app/src/{f.relative_to(src)}:{n}"
        for key in re.findall(r'\b(?:say|label|sayCount)\(\s*"(app\.[a-z_.0-9]+)"', line):
            called.setdefault(key, at)
        for prefix in re.findall(r'\b(?:say|label|sayCount)\(\s*`(app\.[a-z_.0-9]+\.)\$\{', line):
            called.setdefault(prefix + "*", at)

for key, at in sorted(called.items()):
    for lg, keys in blocks.items():
        ok = any(k.startswith(key[:-1]) for k in keys) if key.endswith("*") else key in keys
        if not ok:
            bad += 1
            print(f"MISSING {lg} {key} (called at {at})")

print(f"app-i18n-keys: languages {','.join(sorted(blocks))}, {sum(map(len, blocks.values()))} keys, {len(called)} called, {bad} problems")
sys.exit(1 if bad else 0)
