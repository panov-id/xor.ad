#!/usr/bin/env python3
"""Tests for nd4-compare.py. Run: python scripts/design/nd4-compare.test.py"""
import csv
import importlib.util
import os
import tempfile

from PIL import Image, ImageOps

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("nd4", os.path.join(here, "nd4-compare.py"))
nd4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nd4)

tmp = tempfile.mkdtemp()


def img(invert=False):
    im = Image.new("RGB", (390, 200), (0, 0, 0))
    im.paste((255, 255, 255), (0, 0, 195, 200))
    return ImageOps.invert(im) if invert else im


def setup(shot_id, shot_img):
    mocks = os.path.join(tmp, "m-" + shot_id)
    os.makedirs(os.path.join(mocks, "phone-kypros-day"), exist_ok=True)
    img().save(os.path.join(mocks, "phone-kypros-day", "001-%s.png" % shot_id))
    shots = os.path.join(tmp, "s-" + shot_id)
    os.makedirs(shots, exist_ok=True)
    shot_img.save(os.path.join(shots, "%s-390.png" % shot_id))
    inv = os.path.join(tmp, "inv.csv")
    with open(inv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["n", "id", "title", "zone", "status", "code", "into"])
        w.writerow([1, "aaa", "t", "z", "keep", "", ""])
        w.writerow([2, "bbb", "t", "z", "drop", "", ""])
    return ["--shots", shots, "--out", os.path.join(tmp, "o-" + shot_id),
            "--mockups", mocks, "--inventory", inv]


def run(shot_id, shot_img):
    a = setup(shot_id, shot_img)
    rc = nd4.main(a)
    with open(os.path.join(a[3], "report.csv")) as f:
        return rc, list(csv.DictReader(f))


ok = 0
rc, rows = run("aaa", img())
assert rc == 0 and float(rows[0]["score"]) == 0, "identical must score 0, got %r" % rows
ok += 1
a = setup("aaa", img(invert=True))
assert nd4.main(a) == 0
with open(os.path.join(a[3], "report.csv")) as f:
    inv_score = float(list(csv.DictReader(f))[0]["score"])
assert inv_score > 50, "inverted must score > 50, got %r" % inv_score
ok += 1
a = setup("zzz", img())
assert nd4.main(a) == 1, "unknown id must return 1"
ok += 1
print("%d of 3 ok" % ok)
