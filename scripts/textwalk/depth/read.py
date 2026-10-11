#!/usr/bin/env python3
"""A terminal walk's capture for a person to read: for each @@@ step marker, the last
screen drawn in that step. Ink's debug mode (DEPTH_PLAIN=1) writes every frame after the
previous one, so a step's last frame starts at its last «-----» rule's header.
   python3 scripts/textwalk/depth/read.py <capture> [max lines per step]"""
import re
import sys

raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
cap = int(sys.argv[2]) if len(sys.argv) > 2 else 30
text = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", raw).replace("\r", "")
text = "\n".join(l for l in text.split("\n") if "ExperimentalWarning" not in l and "trace-warnings" not in l)
parts = re.split(r"\n@@@ (.*)\n", text)
for i in range(1, len(parts), 2):
    mark, body = parts[i], parts[i + 1]
    lines = body.split("\n")
    rules = [j for j, l in enumerate(lines) if re.fullmatch(r"-{20,}", l.strip())]
    frame = lines
    if rules:
        top = rules[-1]
        while top > 0 and rules[-1] - top < 4 and lines[top - 1].strip() and not lines[top - 1].endswith("выбрать"):
            top -= 1
        frame = lines[top:]
    out, prev = [], None
    for l in frame:
        if l != prev:
            out.append(l)
        prev = l
    print(f"## {mark}\n" + "\n".join(out[:cap]).strip() + "\n")
