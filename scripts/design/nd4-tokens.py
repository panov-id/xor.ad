#!/usr/bin/env python3
"""Theme tokens of the newdesign4 archive, read from its live mockups.

The mockups bake colours inline, one HTML per style; the layout is the same in every style
and only values differ. This reads, from each <style>-phone.html, the values of fixed places:
  --bg            last layer of the first .scr background
  --panel         background of the first section.rise (the card surface)
  --panel-filter  its backdrop-filter (glass in Amber), or none
  --shadow-panel  its box-shadow
  --r-panel       its border-radius
  --panel-tilt    its rotate() (Chalk's paper), or 0deg
  --text          the most frequent text colour
  --text-muted    the second most frequent text colour
  --font-head     the family of the 24px serif heading
and writes app/tokens/nd4-themes.gen.css: one :root[data-theme="<id>"][data-time="day|night"]
block per style. A place missing in any file fails the run (names the file and the token).
"""
import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs/newdesign4/kit/sosed-design-2026-10-29/screens"
OUT = ROOT / "app/tokens/nd4-themes.gen.css"

# owner 30.10: mockup style -> app theme id
STYLES = {"kypros": "limestone", "golden": "amber", "ceramic": "marble", "paper": "chalk"}
NEEDED = ["--bg", "--panel", "--panel-filter", "--shadow-panel", "--r-panel", "--panel-tilt",
          "--text", "--text-muted", "--font-head"]
TOP = re.compile(r";(?![^(]*\))")


def read(html: str) -> dict:
    body = html[html.find("<body"):]
    body = re.sub(r"url\('data:[^']*'\)", "U", body)
    tok = {}
    scr = re.search(r'class="scr" style="[^"]*?background:([^"]*)"', body)
    if scr:
        tok["--bg"] = re.split(r",(?![^(]*\))", scr.group(1))[-1].strip()
    sec = re.search(r'<section class="rise" style="([^"]*)"', body)
    if sec:
        props = dict(p.split(":", 1) for p in TOP.split(sec.group(1)) if ":" in p)
        for prop, name in (("background", "--panel"), ("box-shadow", "--shadow-panel"), ("border-radius", "--r-panel")):
            if prop in props:
                tok[name] = props[prop]
        tok["--panel-filter"] = props.get("backdrop-filter", "none")
        tilt = re.search(r"rotate\(([^)]*)\)", props.get("transform", ""))
        tok["--panel-tilt"] = tilt.group(1) if tilt else "0deg"
    colors = collections.Counter(re.findall(r'[;"]color:(#[0-9a-fA-F]{3,6})\b', body)).most_common(2)
    if len(colors) == 2:
        tok["--text"], tok["--text-muted"] = colors[0][0], colors[1][0]
    head = re.search(r"font:500 24px ([^;\"]*)", body)
    if head:
        tok["--font-head"] = head.group(1)
    return tok


# Screens not yet rebuilt still read the prototype's ~70 tokens; each new theme starts from a full
# base block (day: white, night: black) out of these files, and the mockup's values go on top.
BASE = {"day": "white", "night": "black"}
BASE_FILES = ["app/tokens/themes.css", "app/tokens/legacy-bridge.css", "app/tokens/proto-motion.gen.css"]

# README_design.md §2: accent id (owner 30.10 gem name) -> day, night
ACCENTS = {
    "carnelian": ("#c2613f", "#e8835a"),
    "coral": ("#e2614a", "#f2836a"),
    "citrine": ("#c98a1e", "#e7b84a"),
    "peridot": ("#5f7f45", "#9cbf74"),
    "turquoise": ("#1f8a8a", "#4fc0bf"),
    "lapis": ("#2f62b8", "#8fb2e8"),
    "amethyst": ("#7a5fb0", "#b49ae0"),
    "tourmaline": ("#b8407a", "#e47aa8"),
}
# what the accent paints (README_design §2: one --accent, the button's gradient by color-mix)
ACCENT_TOKENS = {
    "--primary": "linear-gradient(135deg,color-mix(in srgb,var(--accent) 88%,#fff),var(--accent))",
    "--relief-primary": "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.1) 100%), var(--primary)",
    "--relief-acc": "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.1) 100%), linear-gradient(var(--accent),var(--accent))",
    "--accent-soft": "color-mix(in srgb,var(--accent) 14%,var(--panel-solid))",
}


def base_decls(theme: str, root: Path = ROOT) -> dict:
    decls = {}
    sel = re.escape(f':root[data-theme="{theme}"]') + r"\s*\{([^}]*)\}"
    for f in BASE_FILES:
        for body in re.findall(sel, (root / f).read_text(encoding="utf-8")):
            for k, v in re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", body):
                decls[k] = v.strip()
    return decls


DARK_INK = "#1d1e22"


def lum(h: str) -> float:
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def button(colour: str) -> tuple[str, str]:
    """README_design §2: the button's text reads at >= 4.5 — white, else dark; if neither, the fill darkens by 2% steps until white does."""
    best = max(("#ffffff", DARK_INK), key=lambda ink: contrast(colour, ink))
    if contrast(colour, best) >= 4.5:
        return colour, best
    rgb = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
    for step in range(1, 50):
        k = 1 - 0.02 * step
        fill = "#" + "".join(f"{round(v * k):02x}" for v in rgb)
        if contrast(fill, "#ffffff") >= 4.5:
            return fill, "#ffffff"
    raise ValueError(f"no readable button for {colour}")


def first_colour(v: str) -> str:
    m = re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", v)
    return m.group(0) if m else v


def build(src: Path = SRC, root: Path = ROOT) -> tuple[str, list[str]]:
    blocks, errors = [], []
    for style, theme in STYLES.items():
        for time, suffix in (("day", ""), ("night", "-night")):
            f = src / f"{style}{suffix}-phone.html"
            tok = read(f.read_text(encoding="utf-8"))
            errors += [f"{f.name}: {n} not found" for n in NEEDED if n not in tok]
            decls = base_decls(BASE[time], root)
            if not decls:
                errors.append(f"base theme {BASE[time]} not found in {', '.join(BASE_FILES)}")
            decls.update({k: tok[k] for k in NEEDED if k in tok})
            if "--panel" in tok:
                decls["--panel-solid"] = first_colour(tok["--panel"])
            decls.update(ACCENT_TOKENS)
            lines = "".join(f"  {k}: {v};\n" for k, v in decls.items())
            blocks.append(f':root[data-theme="{theme}"][data-time="{time}"] {{\n{lines}}}\n')
    for acc, pair in ACCENTS.items():
        for time, colour in zip(("day", "night"), pair):
            fill, ink = button(colour)
            blocks.append(f':root[data-accent="{acc}"][data-time="{time}"] {{ --accent: {fill}; --on-accent: {ink}; --on-primary: {ink}; }}\n')
    head = "/* generated by scripts/design/nd4-tokens.py from docs/newdesign4 mockups; do not edit */\n"
    return head + "\n".join(blocks), errors


def main() -> int:
    css, errors = build()
    for e in errors:
        print("ERROR:", e)
    if errors:
        return 1
    OUT.write_text(css, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(STYLES) * 2} theme blocks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
