#!/usr/bin/env python3
"""Strict-review gate (docs/reviews/STRICT_2026-10-11_RU.md): counts the defects the review named.

K1  more than one wide button on a screen (a column of ui-wide instead of one main or a SplitAction)
K2  "back" passed as a header action (right side) instead of the header's own back
L1  service notes drawn inside the device frame of an adaptive sheet
I1  an icon that lies (К3): a button whose testid names one action wearing the icon of another (table below)
INV inventory screens whose source file does not exist yet

Prints one line per defect and a total; exit 1 while any remain. --baseline N exits 0 when total <= N.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCREENS = ROOT / "web/src/screens"
SHEETS = ROOT / "panel/design"
INVENTORY = ROOT / "docs/design/screens-inventory.tsv"
NOTE = re.compile(r"<text\b(?![^>]*class=\"note\")[^>]*>([^<]*(?:names?: «|column \d|rail ≥|stays at|mark \d+px|content \d+ ·)[^<]*)<")

# К3 «значки лгут»: (file, data-testid) -> the icon it must not wear. One icon, one meaning.
LIES = [
    ("Match.tsx", "to-inbox", "say"),      # the way to the inbox is not a speech bubble
    ("Table.tsx", "start-game", "watch"),  # begin / again is not «watch»
    ("TableList.tsx", "more", "new"),      # «show more» is not a plus
    ("Feed.tsx", "more", "new"),
    ("Splash.tsx", "start", "watch"),      # «start» is an entry, not a play triangle
]

found = []
for name, testid, bad in LIES:
    src = (SCREENS / name).read_text()
    marks = [m.start() for m in re.finditer(r'data-testid="%s"' % re.escape(testid), src)]
    if not marks:
        found.append(f"I1 {name}: testid {testid} not found (the table is stale)")
    for at in marks:
        head = src.rfind("<Button", 0, at)
        icon = re.search(r'icon=(?:"([^"]+)"|\{([^}]*)\})', src[head:at]) if head >= 0 else None
        icons = re.findall(r'"([^"]+)"', (icon.group(1) or icon.group(2) or "") if icon else "")
        if icon and icon.group(1):
            icons = [icon.group(1)]
        if bad in icons:
            line = src.count("\n", 0, at) + 1
            found.append(f"I1 {name}:{line}: {testid} wears «{bad}»")
for f in sorted(SCREENS.glob("*.tsx")):
    src = f.read_text()
    wide = len(re.findall(r'className="[^"]*\bui-wide\b', src))
    if wide > 1:
        found.append(f"K1 {f.name}: {wide} wide buttons")
    for m in re.finditer(r'action=\{(?:[^}]*icon="back"|back\()', src):
        line = src.count("\n", 0, m.start()) + 1
        found.append(f"K2 {f.name}:{line}: back as header action")
for f in sorted(SHEETS.glob("adaptive-*.svg")):
    for m in NOTE.finditer(f.read_text()):
        found.append(f"L1 {f.name}: «{m.group(1).strip()[:50]}»")
for row in INVENTORY.read_text().splitlines():
    if row.startswith("#") or not row.strip():
        continue
    cols = row.split("\t")
    src = cols[1].split()[0] if len(cols) > 1 else ""
    if src.startswith("(") or not any((ROOT / "web/src").glob(src)):
        found.append(f"INV {cols[0]}: no code ({cols[1] if len(cols) > 1 else '?'})")

for line in found:
    print(line)
total = len(found)
kinds = {}
for line in found:
    kinds[line.split()[0]] = kinds.get(line.split()[0], 0) + 1
print("strict:", total, "defects", " ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
base = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--baseline" else 0
sys.exit(0 if total <= base else 1)
