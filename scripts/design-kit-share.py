#!/usr/bin/env python3
"""How much of each sheet is drawn from the kit: drawing elements inside phone frames that come
from a kit symbol (an ancestor g[data-kit]) against those drawn by hand. Boards and swatches are
hand-drawn by nature; the number is a trend, not a gate.

    scripts/design-kit-share.py            # table over panel/design/screen-*.svg
"""
import pathlib, xml.etree.ElementTree as ET
SVG = "{http://www.w3.org/2000/svg}"
D = pathlib.Path(__file__).resolve().parent.parent / "panel/design"
DRAW = {SVG + t for t in ("rect", "text", "path", "circle", "line", "polygon", "ellipse")}
def is_frame(g):
    r = next((c for c in g if c.tag == SVG + "rect"), None)
    return (g.get("transform") or "").startswith("translate") and r is not None and r.get("width") in ("375", "377") and r.get("height") in ("812", "814")
tot_k = tot_h = 0
for f in sorted(D.glob("screen-*.svg")):
    root = ET.parse(f).getroot(); kit = hand = 0
    def walk(e, in_frame, in_kit):
        global kit, hand
        for c in e:
            fr = in_frame or (c.tag == SVG + "g" and is_frame(c))
            k = in_kit or c.get("data-kit") is not None
            if fr and c.tag in DRAW and c.get("data-hit") is None and not (c.tag == SVG + "rect" and c.get("width") in ("375", "377") and c.get("height") in ("812", "814")):
                if k: kit += 1
                else: hand += 1
            walk(c, fr, k)
    walk(root, False, False)
    tot_k += kit; tot_h += hand
    print(f"{f.name:28} из кита {kit:5}  вручную {hand:5}  доля кита {kit / max(1, kit + hand):5.0%}")
print(f"{'всего':28} из кита {tot_k:5}  вручную {tot_h:5}  доля кита {tot_k / max(1, tot_k + tot_h):5.0%}")
