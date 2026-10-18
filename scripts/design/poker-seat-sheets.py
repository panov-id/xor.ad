#!/usr/bin/env python3
"""Draws the poker table's seat sheets for 2, 3, 5 and 6 players out of the designer's w3_table-poker (four at the table):
the same sheet with the four seats' chip marks taken away, kept or copied along their row. Everything else - the board,
the pot, the frame, the stickers - is the designer's, untouched. Owner's decision of 18.10.2026: «draw the 2/3/5/6 sheets».

The seats of the sheet (me at the bottom left, then clockwise): BL, BR, TR, TL. Two more places are the middles of the rows,
BM and TM, exactly halfway between the row's ends. By seat count:
  2: BL, TR            (the designer's four with seats 2 and 4 empty: a table growing to four moves nobody)
  3: BL, BR, TR        (the four with seat 4 empty)
  5: BL, BM, BR, TR, TM   (six with TL empty: the sixth joins without moving anyone)
  6: BL, BM, BR, TR, TM, TL
The marks are written top row left to right, then bottom row left to right (the geometry's shape order: measure-app-w3-games).

  scripts/design/poker-seat-sheets.py <designer w3_table-poker.svg> <out dir>      writes w3_table-poker-{2,3,5,6}.svg
A chip mark is the paths whose first point is a known anchor (the brand's four seats, yellow then peach disc) plus the
stroke path (fill="none") right after each; a move adds dx to every x of the path's absolute cairo commands (M/L/C/Z only).
"""
import re
import sys
from pathlib import Path

# the four seats' anchors: first point (pt, in the path's own coordinates) of the yellow disc and of the peach disc
ANCHORS = {
    "sosed":    {"TL": [(74.753906, 142.628906), (83.726562, 147.113281)], "TR": [(207.820312, 142.628906), (216.789062, 147.113281)],
                 "BL": [(67.28125, 286.457031), (76.25, 290.945312)],     "BR": [(200.34375, 286.457031), (209.3125, 290.945312)]},
    "neighbro": {"TL": [(83.998401, 29.998582), (96.001136, 36.002562)],  "TR": [(262.001512, 29.998582), (273.999021, 36.002562)],
                 "BL": [(74.002219, 222.397659), (85.999728, 228.401639)], "BR": [(252.000104, 222.397659), (263.997613, 228.401639)]},
}
LAYOUT = {2: ["TR", "BL"], 3: ["TR", "BL", "BR"], 5: ["TM", "TR", "BL", "BM", "BR"], 6: ["TL", "TM", "TR", "BL", "BM", "BR"]}
PATH = re.compile(r"<path\b[^>]*?/>", re.S)
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def first_point(el):
    m = re.search(r'\bd="M\s+(-?[\d.]+)\s+(-?[\d.]+)', el)
    return (float(m.group(1)), float(m.group(2))) if m else None


def shift_x(el, dx):
    def d_sub(m):
        nums = NUM.findall(m.group(2))
        out, i = [], 0
        for tok in re.split(r"(-?\d+(?:\.\d+)?)", m.group(2)):
            if NUM.fullmatch(tok):
                v = float(tok) + (dx if i % 2 == 0 else 0)
                out.append(f"{v:.6f}".rstrip("0").rstrip("."))
                i += 1
            else:
                out.append(tok)
        assert i == len(nums)
        return m.group(1) + "".join(out) + m.group(3)
    return re.sub(r'(\bd=")([^"]*)(")', d_sub, el, count=1)


def main(src, out_dir):
    text = Path(src).read_text()
    brand = "neighbro" if "neighbro" in str(src) else "sosed"
    anchors = ANCHORS[brand]
    body_at = text.index("</defs>")
    head, body = text[:body_at], text[body_at:]
    paths = list(PATH.finditer(body))
    seats = {}   # seat -> list of (start, end) spans in body, in document order
    for k, m in enumerate(paths):
        fp = first_point(m.group(0))
        for seat, pts in anchors.items():
            if fp and any(abs(fp[0] - x) < 0.01 and abs(fp[1] - y) < 0.01 for x, y in pts):
                spans = seats.setdefault(seat, [])
                spans.append(m.span())
                nxt = paths[k + 1].group(0) if k + 1 < len(paths) else ""
                if 'fill="none"' in nxt and 'stroke-width="1.4"' in nxt:   # the disc's outline (sosed draws it as its own path)
                    spans.append(paths[k + 1].span())
    missing = [s for s in anchors if len(seats.get(s, [])) < 2]
    if missing:
        sys.exit(f"poker-seat-sheets: SPOILED - seats not found in {src}: {missing}")
    seat_text = {s: "".join(body[a:b] for a, b in spans) for s, spans in seats.items()}
    dx_top = (anchors["TR"][0][0] - anchors["TL"][0][0]) / 2
    dx_bottom = (anchors["BR"][0][0] - anchors["BL"][0][0]) / 2
    seat_text["TM"] = "".join(shift_x(body[a:b], dx_top) for a, b in seats["TL"])
    seat_text["BM"] = "".join(shift_x(body[a:b], dx_bottom) for a, b in seats["BL"])
    # cut every seat out; the new row goes where the first seat stood
    all_spans = sorted(sp for spans in seats.values() for sp in spans)
    first = all_spans[0][0]
    stripped = body
    for a, b in reversed(all_spans):
        stripped = stripped[:a] + stripped[b:]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for n, order in LAYOUT.items():
        marks = "".join(seat_text[s] for s in order)
        (out / f"w3_table-poker-{n}.svg").write_text(head + stripped[:first] + marks + stripped[first:])
        print(f"{brand}: w3_table-poker-{n}.svg - seats {' '.join(order)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
