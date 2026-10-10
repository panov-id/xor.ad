#!/usr/bin/env bash
# WD1 gate: the web face takes every colour from the kit
# (panel/design/kit/tokens.css, schemes.css). Red on a colour of its own
# anywhere in web/src:
#   - a hex (#abc, #aabbcc, #aabbccdd);
#   - a colour function: rgb()/rgba(), hsl()/hsla(), hwb(), lab(), lch(),
#     oklab(), oklch(), color();
#   - a named colour (red, white, rebeccapurple…) as the value of a colour
#     property in CSS, or as a quoted value of one in a TS/TSX style object;
#   - color-mix() with a named colour among its arguments.
# Allowed: var(--…), transparent, currentColor, and the CSS-wide keywords;
# color-mix() of var(--…) and transparent is how a tint of a token is written.
# Generated files (*.gen.css, *.gen.ts) are skipped: they are where the
# colours come from — scripts/design/themes-css.py writes them from
# web/themes/<brand>/*.json and validates those (schema, WCAG); its --check
# keeps them in step with the JSON. Comments do not count. WEB_SRC points the gate elsewhere (its probe,
# scripts/test_check-web-tokens.sh).
#
# Second rule (kit_RU.md §1.2–1.3, step К7а): a px literal in web/src/brands/**
# or web/src/screens/*.css is red, with file:line — sizes come from the tokens
# in web/src/tokens.css (--s-*, --r-*, --fs-*, --card-*, --btn-*, --field-*…).
# Zero is not reachable yet (one-off sizes with no token in §1.3), so it is a
# ratchet: scripts/check-web-tokens.px-baseline holds the count per file (a file
# not listed has 0). More than the baseline = red; fewer = red too, until the
# baseline is lowered, so a gain cannot be spent again. PX_BASELINE points to
# another baseline (the probe); PX_PRINT=1 prints the current counts in the
# baseline format and exits.
set -euo pipefail
cd "$(dirname "$0")/.."
src="${WEB_SRC:-web/src}"
python3 - "$src" <<'PY'
import os, pathlib, re, sys
src = pathlib.Path(sys.argv[1])
NAMED = set("""aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown
royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen""".split())
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
FUNC = re.compile(r"\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(", re.I)
# CSS colour properties; the value runs to ; or }.
CSS_PROP = re.compile(r"(?<![\w-])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|"
                      r"fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|"
                      r"stop-color|flood-color|lighting-color|scrollbar-color|--[\w-]+)\s*:\s*([^;}]*)", re.I)
# TS/TSX style objects: color: "red", backgroundColor: 'white'…
TS_PROP = re.compile(r"\b(color|background(?:Color)?|border(?:[A-Z]\w*)?Color|border|outline(?:Color)?|fill|stroke|boxShadow|textShadow|caretColor|accentColor)\s*:\s*[\"'`]([^\"'`]*)[\"'`]")
WORD = re.compile(r"[A-Za-z]+")
MIX = re.compile(r"color-mix\(([^()]*(?:\([^()]*\)[^()]*)*)\)", re.I)

def strip_comments(text: str, css: bool) -> str:
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    if not css:
        text = re.sub(r"(^|[^:])//[^\n]*", lambda m: m.group(1), text)
    return text

def named_in(value: str) -> list[str]:
    value = re.sub(r"var\([^)]*\)", " ", value)          # a token is never a colour of its own
    value = re.sub(r"url\([^)]*\)", " ", value)
    return [w for w in WORD.findall(value) if w.lower() in NAMED]

hits = []
files = sorted(p for p in src.rglob("*") if p.suffix in {".css", ".ts", ".tsx"} and p.is_file()
               and not p.name.endswith((".gen.css", ".gen.ts")))
for path in files:
    css = path.suffix == ".css"
    text = strip_comments(path.read_text(encoding="utf-8"), css)
    for number, line in enumerate(text.splitlines(), 1):
        found = []
        found += [m.group(0) for m in HEX.finditer(line)]
        found += [m.group(0) for m in FUNC.finditer(line)]
        for m in MIX.finditer(line):
            found += [f"color-mix(… {w} …)" for w in named_in(m.group(1))]
        props = CSS_PROP.finditer(line) if css else TS_PROP.finditer(line)
        for m in props:
            value = MIX.sub(" ", m.group(2))                # color-mix is judged above, by its arguments
            found += named_in(value)
        if found:
            hits.append(f"{path}:{number}: {', '.join(dict.fromkeys(found))} — {line.strip()[:120]}")

# --- px literals: brands/** and screens/*.css, outside tokens.css ---
PX = re.compile(r"(?<![\w.])\d*\.?\d+px\b")
def px_scope(path):
    rel = path.relative_to(src)
    if path.suffix != ".css" or path.name == "tokens.css" or path.name.endswith(".gen.css"):
        return None
    if rel.parts[0] == "brands" or (rel.parts[0] == "screens" and len(rel.parts) == 2):
        return rel.as_posix()
    return None
px_hits = {}
for path in sorted(src.rglob("*.css")):
    rel = px_scope(path) if path.is_file() else None
    if rel is None:
        continue
    text = strip_comments(path.read_text(encoding="utf-8"), True)
    found = [(n, m.group(0), line.strip()[:100]) for n, line in enumerate(text.splitlines(), 1) for m in PX.finditer(line)]
    px_hits[rel] = (path, found)

if os.environ.get("PX_PRINT"):
    for rel, (_, found) in sorted(px_hits.items()):
        print(f"{rel} {len(found)}")
    sys.exit(0)

baseline = {}
bpath = pathlib.Path(os.environ.get("PX_BASELINE", "scripts/check-web-tokens.px-baseline"))
if bpath.is_file():
    for raw in bpath.read_text(encoding="utf-8").splitlines():
        raw = raw.split("#", 1)[0].strip()
        if raw:
            name, count = raw.rsplit(None, 1)
            baseline[name] = int(count)
px_red = []
for rel in sorted(set(px_hits) | set(baseline)):
    path, found = px_hits.get(rel, (src / rel, []))
    have, allowed = len(found), baseline.get(rel, 0)
    if have > allowed:
        px_red.append(f"{path}: {have} px literals, baseline {allowed} — a size comes from a token (web/src/tokens.css), not a literal:")
        px_red += [f"  {path}:{n}: {lit} — {txt}" for n, lit, txt in found]
    elif have < allowed:
        px_red.append(f"{path}: {have} px literals, baseline {allowed} — lower the baseline ({bpath}) to {have}")

if not files:
    print(f"check-web-tokens: RED — no .css/.ts/.tsx under {src}: nothing was checked")
    sys.exit(1)
if hits:
    print("check-web-tokens: RED — colours outside the kit tokens:")
    print("\n".join(hits))
    sys.exit(1)
if px_red:
    print("check-web-tokens: RED — px literals outside tokens.css:")
    print("\n".join(px_red))
    sys.exit(1)
print(f"check-web-tokens: GREEN — {len(files)} files under {src} name no colour of their own; "
      f"{sum(len(f) for _, f in px_hits.values())} px literals in {len(px_hits)} brand/screen css files, none above the baseline")
PY
