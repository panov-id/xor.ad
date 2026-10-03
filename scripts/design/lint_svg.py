#!/usr/bin/env python3
# Geometry lint for 375x812 screen SVGs: text inside the 16px safe gutters, no Cyrillic left,
# no two text boxes overlapping. Uses inkscape --query-all (real rendered bboxes).
import subprocess, sys, re, xml.etree.ElementTree as ET
W, G = 375, 16
bad = 0
for f in sys.argv[1:]:
    src = open(f, encoding="utf-8").read()
    if re.search(r"[А-Яа-яЁё]", src):
        print(f"{f}: Cyrillic text left"); bad += 1
    root = ET.parse(f).getroot()
    tids = {e.get("id") for e in root.iter() if e.tag.endswith("text") and e.get("id")}
    out = subprocess.run(["inkscape", "--query-all", f], capture_output=True, text=True).stdout
    boxes = []
    for line in out.splitlines():
        i, x, y, w, h = line.split(",")[:5]
        if i in tids: boxes.append((i, float(x), float(y), float(w), float(h)))
    if len(tids) == 0 and root.iter():
        print(f"{f}: texts have no id — give every <text> an id so the lint can measure it"); bad += 1
    for i, x, y, w, h in boxes:
        if x < G - 0.5 or x + w > W - G + 0.5:
            print(f"{f}: {i} outside gutters x={x:.0f}..{x+w:.0f}"); bad += 1
    for a in range(len(boxes)):
        for b in range(a + 1, len(boxes)):
            _, x1, y1, w1, h1 = boxes[a]; _, x2, y2, w2, h2 = boxes[b]
            if x1 < x2 + w2 - 1 and x2 < x1 + w1 - 1 and y1 < y2 + h2 - 1 and y2 < y1 + h1 - 1:
                print(f"{f}: {boxes[a][0]} overlaps {boxes[b][0]}"); bad += 1
print(f"lint: {bad} problems in {len(sys.argv)-1} files"); sys.exit(1 if bad else 0)
