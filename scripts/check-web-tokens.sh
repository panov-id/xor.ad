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
set -euo pipefail
cd "$(dirname "$0")/.."
src="${WEB_SRC:-web/src}"
python3 - "$src" <<'PY'
import pathlib, re, sys
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

if not files:
    print(f"check-web-tokens: RED — no .css/.ts/.tsx under {src}: nothing was checked")
    sys.exit(1)
if hits:
    print("check-web-tokens: RED — colours outside the kit tokens:")
    print("\n".join(hits))
    sys.exit(1)
print(f"check-web-tokens: GREEN — {len(files)} files under {src} name no colour of their own")
PY
