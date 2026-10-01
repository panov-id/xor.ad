#!/usr/bin/env python3
"""Derive the kit's colour schemes and prove their contrast.

    scripts/design-palettes.py            # print the table and write panel/design/kit/schemes.css
    scripts/design-palettes.py --check    # exit 1 if schemes.css is stale or a pair falls under its bar

Schemes (owner's request of 2026-09-19: «примеры в других цветовых решениях», «раста цвет»):
  * six accents of sosed (screen 22) on the dark and the light ground — class k-acc-<name>;
  * neighbro.place — its brand hues (landing/index.html of that repo), with the app's own surfaces:
    the landing's --panel #14120e on #0c0b09 is 1.06:1 and a card would vanish — class k-neighbro[-light];
  * rasta — red, gold and green on a warm black and on a warm paper — class k-rasta[-light].
Bars (WCAG 2.x): text 4.5 (--fg, --muted, --accent-text on --panel, --accent-ink on --accent),
controls 3.0 (--border-control on --panel and on --bg), categories 4.5 on --panel.
A derived colour keeps its hue and saturation; only lightness moves until the bar is met.
"""
import colorsys, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "panel/design/kit/schemes.css"

def hx(c): c = c.lstrip("#"); return tuple(int(c[i:i+2], 16) / 255 for i in (0, 2, 4))
def lum(c):
    r = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in hx(c)]
    return 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]
def ratio(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True); return (x + 0.05) / (y + 0.05)
def tohex(rgb): return "#" + "".join(f"{round(max(0, min(1, v)) * 255):02x}" for v in rgb)
def reach(c, ground, bar, step=0.005):
    """Move c's lightness away from ground until ratio(c, ground) >= bar."""
    h, l, s = colorsys.rgb_to_hls(*hx(c)); up = lum(ground) < 0.18
    while ratio(tohex(colorsys.hls_to_rgb(h, l, s)), ground) < bar and 0 <= l <= 1:
        l += step if up else -step
    return tohex(colorsys.hls_to_rgb(h, max(0, min(1, l)), s))
def ink(accent):
    """Light or dark ink on the accent, whichever is higher; darkened/lightened to 4.5 if neither is."""
    light, dark = "#fff6f0", "#1a1509"
    best = light if ratio(light, accent) >= ratio(dark, accent) else dark
    return best

SOSED_DARK = dict(bg="#0d0b0a", panel="#262019", panel2="#302720", border="#3a2e20", control="#80705a", fg="#f0e7dc", muted="#9a8d7c")
SOSED_LIGHT = dict(bg="#ece4d8", panel="#fdfaf4", panel2="#e6dbc9", border="#221a12", control="#857562", fg="#1c140d", muted="#6b5f4c")
ACCENTS = dict(terra="#bd4b2a", amber="#d68a1f", turquoise="#1fa99a", azure="#336eb2", violet="#8550c5", carmine="#cc2f27")

rows, css = [], []
def check(scheme, pairs):
    for name, a, b, bar in pairs:
        r = ratio(a, b); rows.append((scheme, name, a, b, r, bar))

def block(sel, t):
    return sel + " { " + " ".join(f"--{k}: {v};" for k, v in t.items()) + " }"

# 1 · six accents × two grounds: only the accent triple changes, the surfaces stay sosed's
for name, acc in ACCENTS.items():
    for mode, g in (("dark", SOSED_DARK), ("light", SOSED_LIGHT)):
        a_ink = ink(acc)
        a_text = reach(reach(acc, g["panel"], 4.5), g["bg"], 4.5)   # it sits on cards and on the bare ground
        if name == "terra":   # the live accent keeps its agreed pair from kit/tokens.css (checked below like the rest)
            a_text = "#e0714f" if mode == "dark" else "#983c22"
        sel = f".k-{mode}.k-acc-{name}"
        css.append(block(sel, {"accent": acc, "accent-ink": a_ink, "accent-text": a_text}))
        check(f"{name}·{mode}", [("accent-ink на accent", a_ink, acc, 4.5), ("accent-text на panel", a_text, g["panel"], 4.5),
                                ("accent-text на bg", a_text, g["bg"], 4.5)])

def full(sel, scheme, t, cats):
    t = dict(t)
    t["accent-text"] = reach(reach(t["accent"], t["panel"], 4.5), t["bg"], 4.5)
    t["accent-ink"] = ink(t["accent"])
    t["border-control"] = reach(t["border-control"], t["panel"], 3.0)
    t["muted"] = reach(t["muted"], t["panel-2"], 4.5)
    for k, v in cats.items(): t[k] = reach(v, t["panel"], 4.5)
    css.append(block(sel, t))
    check(scheme, [("fg на panel", t["fg"], t["panel"], 4.5), ("muted на panel-2", t["muted"], t["panel-2"], 4.5),
                   ("accent-ink на accent", t["accent-ink"], t["accent"], 4.5), ("accent-text на panel", t["accent-text"], t["panel"], 4.5),
                   ("border-control на panel", t["border-control"], t["panel"], 3.0), ("border-control на bg", t["border-control"], t["bg"], 3.0),
                   ("bg на fg (таблетка)", t["bg"], t["fg"], 4.5)]
          + [(f"{k} на panel", t[k], t["panel"], 4.5) for k in cats])

# 2 · neighbro.place: the landing's ground, fg and gold (neighbro.place landing/index.html:86-115);
# the app surfaces lifted the way sosed's were (panel ≈ 1.2:1 to bg)
full(".k-neighbro", "neighbro·dark", {"bg": "#0c0b09", "panel": "#24211a", "panel-2": "#2e2a21", "border": "#3a331f",
     "border-control": "#6a5d39", "fg": "#ede8dd", "muted": "#8a8172", "muted-2": "#928979", "accent": "#c6a24e",
     "ok": "#9ecb7a", "err": "#ff8a80", "scrim": "#000000", "shadow": "#3a331f", "on-fg-muted": "#5f5a4e"},
     {"cat-amber": "#c6a24e", "cat-teal": "#1fb39a", "cat-violet": "#9b5de5"})
full(".k-neighbro-light", "neighbro·light", {"bg": "#e9e6dd", "panel": "#f4f1e8", "panel-2": "#ded9cc", "border": "#1e1b14",
     "border-control": "#857a62", "fg": "#181510", "muted": "#5f5a4e", "muted-2": "#5c5749", "accent": "#c6a24e",
     "ok": "#4b712c", "err": "#a3311f", "scrim": "#000000", "shadow": "#857a62", "on-fg-muted": "#b0a894"},
     {"cat-amber": "#735b25", "cat-teal": "#126a5c", "cat-violet": "#793fbe"})
# 2a · neighbro.place, night brief 2026-09-20 (docs/reviews/NIGHT_2026-09-20_design.md): sea blue acts, the landing's
# gold stays as the second accent (cat-amber) — light is the default theme, dark the evening one
full(".k-neighbro-sea-light", "neighbro-sea·light", {"bg": "#f3f1ea", "panel": "#ffffff", "panel-2": "#e6ebe8", "border": "#c9d1ce",
     "border-control": "#7d8b88", "fg": "#14201e", "muted": "#56625f", "muted-2": "#6b7774", "accent": "#0f6f86",
     "ok": "#2f6b3a", "err": "#a3311f", "scrim": "#000000", "shadow": "#14201e", "on-fg-muted": "#93a5a1"},
     {"cat-amber": "#c6a24e", "cat-teal": "#0f6f86", "cat-violet": "#6b4fb3"})
full(".k-neighbro-sea", "neighbro-sea·dark", {"bg": "#0b1416", "panel": "#132024", "panel-2": "#1c2d31", "border": "#23383d",
     "border-control": "#5f7a80", "fg": "#e7efec", "muted": "#93a5a1", "muted-2": "#6f8480", "accent": "#4fb3c9",
     "ok": "#9ecb7a", "err": "#ff8a80", "scrim": "#000000", "shadow": "#000000", "on-fg-muted": "#56625f"},
     {"cat-amber": "#c6a24e", "cat-teal": "#4fb3c9", "cat-violet": "#b48cf2"})
# 3 · rasta: red for action, gold and green for categories, on a warm black and a warm paper
full(".k-rasta", "rasta·dark", {"bg": "#0b0a06", "panel": "#221f14", "panel-2": "#2c281a", "border": "#3a3420",
     "border-control": "#7a6d3e", "fg": "#f5eed6", "muted": "#a39a7a", "muted-2": "#6e6647", "accent": "#d7261e",
     "ok": "#3fbf5f", "err": "#ff7a6e", "scrim": "#000000", "shadow": "#1f6b35", "on-fg-muted": "#6e6647"},
     {"cat-amber": "#f2b705", "cat-teal": "#2e9e4f", "cat-violet": "#e0483f"})
full(".k-rasta-light", "rasta·light", {"bg": "#f3ecd2", "panel": "#fffaea", "panel-2": "#ece2c2", "border": "#1c1a10",
     "border-control": "#8a7b45", "fg": "#15130b", "muted": "#5e5636", "muted-2": "#8a7b45", "accent": "#b81c15",
     "ok": "#1f6b35", "err": "#a3211a", "scrim": "#000000", "shadow": "#1f6b35", "on-fg-muted": "#b8ad84"},
     {"cat-amber": "#8a6400", "cat-teal": "#1f6b35", "cat-violet": "#a3211a"})

# 4 · comic (owner 2026-10-01, web/design/comic-2026-10-01.svg; restyled the same day: no stars, no halftone, gold,
# a calm night without neon). Four frames: sosed day and night, neighbro day and night. Besides the kit's names
# each carries --ink (outlines), --paper, --pop (the header plate), --rim (a card's edge), the feed header's scenes
# --sky-*/--sc-* (web/src/ui/Scene.tsx), and the comic's geometry — every style number lives here, so a change of
# the mock is one edit of this block: --comic-line (outline), --comic-cut (the cut corner), --comic-drop-x/-y (the
# hard shadow), --comic-tilt (a card's lean), --comic-scene-h (the feed header), --gold-1/--gold-2 (the gold
# gradient gold-1 → gold-2 → gold-1 of the primary button and the like's medallion).
COMIC_SCENES = {"sky-s-morning-0": "#f7dccf", "sky-s-morning-1": "#c9d6e3", "sky-s-day-0": "#8fd3ff", "sky-s-day-1": "#d8f1ff",
    "sky-s-sunset-0": "#a33e1f", "sky-s-sunset-1": "#d68a1f", "sky-s-night-0": "#0e1324", "sky-s-night-1": "#18203a",
    "sky-n-morning-0": "#ffc4d6", "sky-n-morning-1": "#ffe3b8", "sky-n-day-0": "#5fd4f0", "sky-n-day-1": "#c8f4ff",
    "sky-n-sunset-0": "#3a1466", "sky-n-sunset-1": "#c25a6a", "sky-n-night-0": "#0e1324", "sky-n-night-1": "#18203a",
    "sky-title-dark": "#141018", "sky-title-light": "#fff4e0",
    "sc-ink": "#141018", "sc-paper": "#fff4e0", "sc-white": "#ffffff", "sc-yellow": "#e9cf8a", "sc-pink": "#c25a6a",
    "sc-teal": "#12b5b0", "sc-orange": "#ff6b1a", "sc-neon": "#b8893b", "sc-deep": "#070a14", "sc-dusk": "#2b1850",
    "sc-bldg-morning": "#6c7a96", "sc-bldg-day": "#e9c9a0", "sc-bldg-night": "#070a14", "sc-win-morning": "#8a96ad",
    "sc-win-day": "#9fc6e8", "sc-sun-morning": "#ffd9a0", "sc-sea-morning": "#9fd7e0", "sc-peach": "#ffe3b8"}
COMIC_GEOMETRY = {"comic-line": "2.5px", "comic-cut": "16px", "comic-drop-x": "4px", "comic-drop-y": "4px", "comic-tilt": "0deg",
    "comic-scene-h": "160px", "gold-1": "#b8893b", "gold-2": "#e9cf8a"}
for b in ("s", "n"):
    for ph in ("morning", "day", "sunset", "night"):
        t = COMIC_SCENES["sky-title-dark" if ph in ("morning", "day") else "sky-title-light"]
        check(f"comic-scene·{b}·{ph}", [("заголовок на небе", t, COMIC_SCENES[f"sky-{b}-{ph}-0"], 4.5)])
css.append(block(".k-comic, .k-comic-night, .k-comic-neighbro, .k-comic-neighbro-night", {**COMIC_SCENES, **COMIC_GEOMETRY}))
def comic(sel, scheme, t):
    t = dict(t)
    t["accent-text"] = reach(reach(t["accent"], t["panel"], 4.5), t["bg"], 4.5)
    t["muted-2"] = t["muted"]
    css.append(block(sel, t))
    check(scheme, [("fg на panel", t["fg"], t["panel"], 4.5), ("fg на bg", t["fg"], t["bg"], 4.5),
                   ("muted на panel", t["muted"], t["panel"], 4.5), ("muted на panel-2", t["muted"], t["panel-2"], 4.5),
                   ("accent-ink на accent", t["accent-ink"], t["accent"], 4.5), ("accent-text на panel", t["accent-text"], t["panel"], 4.5),
                   ("ink на pop (плашка)", t["ink"], t["pop"], 4.5),
                   ("ink на gold-1 (кнопка, медальон)", "#141018", COMIC_GEOMETRY["gold-1"], 4.5),
                   ("border-control на panel", t["border-control"], t["panel"], 3.0), ("bg на fg (таблетка)", t["bg"], t["fg"], 4.5)]
          + [(f"{k} на panel", t[k], t["panel"], 4.5) for k in ("cat-amber", "cat-teal", "cat-violet", "err")])
comic(".k-comic", "comic·sosed·day", {"bg": "#ffe3b8", "panel": "#fff4e0", "panel-2": "#efdcc0", "border": "#141018",
      "border-control": "#141018", "fg": "#141018", "muted": "#5a4a5e", "accent": "#ff6b1a", "accent-ink": "#141018",
      "ok": "#2f6b3a", "err": "#a3311f", "scrim": "#000000", "shadow": "#141018", "on-fg-muted": "#c9b8a0",
      "cat-amber": "#7a4a00", "cat-teal": "#0d6b68", "cat-violet": "#6b2fa8",
      "ink": "#141018", "paper": "#fff4e0", "pop": "#e9cf8a", "pop-2": "#ff6b1a", "pop-3": "#12b5b0", "rim": "#141018"})
comic(".k-comic-night", "comic·sosed·night", {"bg": "#0e1324", "panel": "#18203a", "panel-2": "#222c4c", "border": "#070a14",
      "border-control": "#b8893b", "fg": "#f3ecdc", "muted": "#a9b3cc", "accent": "#e9cf8a", "accent-ink": "#141018",
      "ok": "#9ecb7a", "err": "#ff8a80", "scrim": "#000000", "shadow": "#070a14", "on-fg-muted": "#5a6480",
      "cat-amber": "#e9cf8a", "cat-teal": "#7fc8c0", "cat-violet": "#c6b4e8",
      "ink": "#070a14", "paper": "#18203a", "pop": "#e9cf8a", "pop-2": "#b8893b", "pop-3": "#7fc8c0", "rim": "#b8893b"})
comic(".k-comic-neighbro", "comic·neighbro·day", {"bg": "#e9e6dd", "panel": "#f4f1e8", "panel-2": "#ded9cc", "border": "#141018",
      "border-control": "#141018", "fg": "#181510", "muted": "#5f5a4e", "accent": "#4fb3c9", "accent-ink": "#141018",
      "ok": "#2f6b3a", "err": "#a3311f", "scrim": "#000000", "shadow": "#141018", "on-fg-muted": "#b0a894",
      "cat-amber": "#735b25", "cat-teal": "#0f6f86", "cat-violet": "#793fbe",
      "ink": "#141018", "paper": "#f4f1e8", "pop": "#e9cf8a", "pop-2": "#4fb3c9", "pop-3": "#c25a6a", "rim": "#141018"})
comic(".k-comic-neighbro-night", "comic·neighbro·night", {"bg": "#0e1324", "panel": "#18203a", "panel-2": "#222c4c", "border": "#070a14",
      "border-control": "#b8893b", "fg": "#f3ecdc", "muted": "#a9b3cc", "accent": "#4fb3c9", "accent-ink": "#141018",
      "ok": "#9ecb7a", "err": "#ff8a80", "scrim": "#000000", "shadow": "#070a14", "on-fg-muted": "#5a6480",
      "cat-amber": "#e9cf8a", "cat-teal": "#4fb3c9", "cat-violet": "#c6b4e8",
      "ink": "#070a14", "paper": "#18203a", "pop": "#e9cf8a", "pop-2": "#4fb3c9", "pop-3": "#b8893b", "rim": "#b8893b"})
# Russo One (OFL), the comic's headings: Cyrillic and Latin subsets, fetched by scripts/fetch-fonts.sh into panel/design/fonts
FONTS = [
    '@font-face { font-family: "Russo One"; font-weight: 400; font-display: swap; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; src: url(/fonts/Z9XUDmZRWg6M1LvRYsHOy8mJrrg.woff2) format("woff2"); }',
    '@font-face { font-family: "Russo One"; font-weight: 400; font-display: swap; unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; src: url(/fonts/Z9XUDmZRWg6M1LvRYsHOwcmJrrg.woff2) format("woff2"); }',
    '@font-face { font-family: "Russo One"; font-weight: 400; font-display: swap; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; src: url(/fonts/Z9XUDmZRWg6M1LvRYsHOz8mJ.woff2) format("woff2"); }']
css.extend(FONTS)

text = ("    /* kit schemes — built by scripts/design-palettes.py; edit the script, not this file.\n"
        "       A frame wears one of: k-dark/k-light + k-acc-NAME; k-neighbro or k-neighbro-light; k-neighbro-sea or k-neighbro-sea-light; k-rasta or k-rasta-light; k-comic, k-comic-night, k-comic-neighbro or k-comic-neighbro-night. */\n"
        + "\n".join("    " + c for c in css) + "\n")
bad = [r for r in rows if r[4] < r[5] - 1e-9]
if "--check" in sys.argv:
    stale = not OUT.exists() or OUT.read_text(encoding="utf-8") != text
    for r in bad: print(f"  ✗ {r[0]}: {r[1]} {r[2]} / {r[3]} = {r[4]:.2f} < {r[5]}")
    if stale: print("  ✗ panel/design/kit/schemes.css устарел — scripts/design-palettes.py")
    if bad or stale: sys.exit(1)
    print(f"схем: {len(set(r[0] for r in rows))}, пар: {len(rows)} — все не ниже порога, schemes.css свежий"); sys.exit(0)
OUT.write_text(text, encoding="utf-8")
for r in rows: print(f"{'✗' if r in bad else ' '} {r[0]:<18} {r[1]:<26} {r[2]} / {r[3]}  {r[4]:5.2f}  (≥{r[5]})")
print(f"схем: {len(set(r[0] for r in rows))}, пар: {len(rows)}, ниже порога: {len(bad)}")
