#!/usr/bin/env python3
"""Nearest accent-text that reads on every ground of a theme.

Reads web/themes/<brand>/*.json and, for each theme whose accent-text is under
4.5:1 on bg, surface or surface-2 (the three grounds a word in the accent can sit
on: the page, a card, a nested plate), prints the same hue and saturation with the
lightness moved the least (steps of 1/1000, darker on a light theme, lighter on a
dark one) until all three clear 4.5:1. Writes nothing: the value goes into the
theme's generator (scripts/design/sosed-themes.py ACC), which writes the JSON.

  python3 scripts/design/fit-accent-text.py [--brand sosed] [--min 4.5]

Mono themes are skipped: their text is the equal-luminance grey of the base
theme's, so they follow it. Same way of working as scripts/design-palettes.py
took for the gold of neighbro (lightness moved until the worst ground clears).
"""
import argparse
import colorsys
import glob
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def worst(txt, t):
    return min(ratio(txt, t[g]) for g in ("bg", "surface", "surface-2"))


def fit(txt, t, scheme, need):
    r, g, b = (int(txt[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    step = -0.001 if scheme == "light" else 0.001
    for _ in range(1000):
        l += step
        if not 0 <= l <= 1:
            return None
        cand = "#%02x%02x%02x" % tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, l, s))
        if worst(cand, t) >= need:
            return cand
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand", default="sosed")
    ap.add_argument("--min", type=float, default=4.5)
    a = ap.parse_args()
    for f in sorted(glob.glob(str(ROOT / "web/themes" / a.brand / "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        if d["id"].startswith("mono"):
            continue
        t = d["tokens"]
        w = worst(t["accent-text"], t)
        if w >= a.min:
            continue
        new = fit(t["accent-text"], t, d["scheme"], a.min)
        print(f"{d['id']}: accent-text {t['accent-text']} ({w:.2f}:1) -> {new} ({worst(new, t):.2f}:1)")


if __name__ == "__main__":
    main()
