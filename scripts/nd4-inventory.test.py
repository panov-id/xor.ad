#!/usr/bin/env python3
"""Tests of nd4-inventory.py: real archive maps fully; a forgotten old screen fails."""
import csv
import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("inv", Path(__file__).with_name("nd4-inventory.py"))
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


def test_real_archive_maps_all():
    rows, errors = inv.build()
    assert errors == [], errors
    screens = [r for r in rows if r["status"] in ("keep", "new")]
    # the archive's own list, read here: a new screen in screens.csv and not in the inventory fails
    import csv
    src = list(csv.DictReader(open(Path(__file__).resolve().parents[1] / "docs/newdesign4/kit/sosed-design-2026-10-29/screens.csv", encoding="utf-8")))
    assert len(src) == 283, len(src)  # 30.10: + lost-* (7) and spot-* (8)
    assert len(screens) == len(src), (len(screens), len(src))
    assert {r["id"] for r in screens} == {r["id"] for r in src}


def test_forgotten_old_screen_fails():
    with tempfile.TemporaryDirectory() as d:
        new = Path(d) / "new.csv"
        old = Path(d) / "old.csv"
        new.write_text("№,id,экран,зона\n1,nearby,Лента,3\n", encoding="utf-8")
        with open(old, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "code"])
            w.writerow(["feed", "Feed.tsx"])
            w.writerow(["ghost", "Ghost.tsx"])
        rows, errors = inv.build(new, old)
        assert any("ghost" in e for e in errors), errors
        assert rows[0]["code"] == "Feed.tsx"


if __name__ == "__main__":
    test_real_archive_maps_all()
    test_forgotten_old_screen_fails()
    print("2 of 2 ok")
