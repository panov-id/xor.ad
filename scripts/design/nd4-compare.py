#!/usr/bin/env python3
"""Score app screenshots against newdesign4 mockup PNGs by screen id.

Usage: nd4-compare.py --shots DIR --out DIR [--mockups DIR] [--inventory CSV]

Shots are named <id>-<width>.png (width 390, 820 or 1440).
Mockups: docs/newdesign4/kit/sosed-design-2026-10-29/png/{phone,tablet,laptop}-kypros-day/NNN-<id>.png
  phone = 390 (real mockup pixels 390x844), tablet = 820 (real mockup pixels 428x608
  on the sample checked), laptop = 1440 (real 780x479 on the sample checked).
  Mockup real sizes differ from the nominal widths, so the mockup is scaled to the
  shot width, then both are cropped to the same height.
Score: mean absolute difference of 64-px-wide greyscale downscales, 0..100 (0 = same).
Output: OUT/<id>-<width>.png side by side (mockup | shot), OUT/report.csv (id,width,score).
Exit 1 if a shot id is not in the inventory (status keep/new).
"""
import argparse
import csv
import glob
import os
import re
import statistics
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MOCK = os.path.join(ROOT, "docs/newdesign4/kit/sosed-design-2026-10-29/png")
INV = os.path.join(ROOT, "docs/newdesign4/inventory.csv")
DIRS = {390: "phone-kypros-day", 820: "tablet-kypros-day", 1440: "laptop-kypros-day"}


def inventory_ids(path):
    with open(path, newline="", encoding="utf-8") as f:
        return {r["id"] for r in csv.DictReader(f) if r["status"] in ("keep", "new")}


def prepare(mock, shot):
    """Scale mockup to shot width, crop both to the same height."""
    w = shot.width
    mock = mock.resize((w, max(1, round(mock.height * w / mock.width))), Image.LANCZOS)
    h = min(mock.height, shot.height)
    return mock.crop((0, 0, w, h)), shot.crop((0, 0, w, h))


def score(a, b):
    """Mean abs diff of 64-px-wide greyscale downscales, 0..100."""
    h = max(1, round(a.height * 64 / a.width))
    ga = a.convert("L").resize((64, h), Image.LANCZOS)
    gb = b.convert("L").resize((64, h), Image.LANCZOS)
    pa, pb = list(ga.getdata()), list(gb.getdata())
    return sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa) / 255 * 100


def find_mockup(mockups, sid, width):
    d = DIRS.get(width)
    if not d:
        return None
    hits = glob.glob(os.path.join(mockups, d, "[0-9][0-9][0-9]-%s.png" % glob.escape(sid)))
    return hits[0] if hits else None


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--shots", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--mockups", default=MOCK)
    p.add_argument("--inventory", default=INV)
    args = p.parse_args(argv)

    ids = inventory_ids(args.inventory)
    shots = []
    for f in sorted(glob.glob(os.path.join(args.shots, "*.png"))):
        m = re.fullmatch(r"(.+)-(\d+)\.png", os.path.basename(f))
        if m:
            shots.append((m.group(1), int(m.group(2)), f))
    bad = sorted({s for s, _, _ in shots if s not in ids})
    if bad:
        print("unknown screen id (not in inventory): " + ", ".join(bad), file=sys.stderr)
        return 1

    os.makedirs(args.out, exist_ok=True)
    rows = []
    for sid, width, f in shots:
        mp = find_mockup(args.mockups, sid, width)
        if not mp:
            print("no mockup for %s at %d, skipped" % (sid, width), file=sys.stderr)
            continue
        mock, shot = prepare(Image.open(mp).convert("RGB"), Image.open(f).convert("RGB"))
        s = score(mock, shot)
        side = Image.new("RGB", (mock.width * 2 + 10, mock.height), (255, 0, 255))
        side.paste(mock, (0, 0))
        side.paste(shot, (mock.width + 10, 0))
        side.save(os.path.join(args.out, "%s-%d.png" % (sid, width)))
        rows.append((sid, width, s))

    with open(os.path.join(args.out, "report.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "width", "score"])
        for sid, width, s in rows:
            w.writerow([sid, width, "%.2f" % s])
    worst = sorted(rows, key=lambda r: -r[2])[:3]
    med = statistics.median([r[2] for r in rows]) if rows else 0.0
    print("compared %d of %d; median %.2f; worst: %s" % (
        len(rows), len(shots), med, ", ".join("%s %.2f" % (r[0], r[2]) for r in worst)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
