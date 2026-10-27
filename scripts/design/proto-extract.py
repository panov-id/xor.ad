#!/usr/bin/env python3
"""Screens of the new design from the owner's prototype (docs/newdesing2 archives, prototype/index.html).

The prototype keeps each of its screens as ready HTML with inline styles, once per theme (sea, plum, black, white).
This script takes the four copies of every screen, checks they differ only in colours, and writes one theme-free copy
where every colour that changes with the theme is the token whose four values match (elements/tokens.css), e.g.
`#432649 / #f2c068 / #1b1b1e / #ffffff` -> `var(--panel-solid)`. Out: docs/newdesign/proto/<id>.html, tokens.css,
index.json (id, zone, title, english words). A theme colour with no token in the archive (the scene's, the shadows') gets one of its own, --pc-<n>, defined per theme
at the end of tokens.css, so no screen keeps a theme's literal colour.

Usage: proto-extract.py [archives] [out dir] [app shell dir] [app tokens dir]
  archives: docs/newdesing2 (the four sosed-<theme>-*.zip) by default, or a folder of the four unpacked archives;
  out: docs/newdesign/proto; app shell dir: app/src/shell (proto-icons.gen.ts, proto-art.gen.ts);
  app tokens dir: app/tokens (proto-motion.gen.css: keyframes carry px, and raw px live only in app/tokens).
"""
import json, re, sys, zipfile
from pathlib import Path

THEMES = ["sea", "plum", "black", "white"]
COLOUR = re.compile(r"linear-gradient\([^()]*(?:\([^()]*\)[^()]*)*\)|rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b")


def load(root: Path, theme: str) -> dict:
    zips = sorted(root.glob(f"sosed-{theme}-*.zip"))
    if zips:
        with zipfile.ZipFile(zips[0]) as z:
            top = zips[0].stem
            t, tokens = z.read(f"{top}/prototype/index.html").decode(), z.read(f"{top}/elements/tokens.css").decode()
    else:
        arch = next(root.glob(f"{theme}/sosed-{theme}-*"))
        t, tokens = (arch / "prototype/index.html").read_text(), (arch / "elements/tokens.css").read_text()
    i = t.index("const P = ") + 10
    return {"P": json.JSONDecoder().raw_decode(t[i:])[0], "tokens": tokens, "html": t}


def token_values(css: str, theme: str) -> dict:
    m = re.search(r':root\[data-theme="%s"\]\s*\{([^}]*)\}' % theme, css)
    return {k: v.strip() for k, v in re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", m.group(1))} if m else {}


def norm(c: str) -> str:
    return c.lower().replace(" ", "")


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/newdesing2"); out = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/newdesign/proto"); out.mkdir(parents=True, exist_ok=True)
    shell = Path(sys.argv[3] if len(sys.argv) > 3 else "app/src/shell"); shell.mkdir(parents=True, exist_ok=True)
    tokens = Path(sys.argv[4] if len(sys.argv) > 4 else "app/tokens"); tokens.mkdir(parents=True, exist_ok=True)
    data = {th: load(root, th) for th in THEMES}
    toks = {th: token_values(data[th]["tokens"], th) for th in THEMES}
    by_tuple = {}
    for name in toks["plum"]:
        tup = tuple(norm(toks[th].get(name, "")) for th in THEMES)
        if all(tup) and len(set(tup)) > 1: by_tuple.setdefault(tup, name)
    css = "\n".join(re.search(r':root\[data-theme="%s"\]\s*\{[^}]*\}' % th, data[th]["tokens"]).group(0) for th in THEMES)
    reduce = re.search(r"@media \(prefers-reduced-motion: reduce\) \{.*?\n\}", data["plum"]["tokens"], re.S).group(0)
    (out / "tokens.css").write_text("/* the four themes, verbatim from the archives' elements/tokens.css (scripts/design/proto-extract.py; app/tokens/themes.css is this file) */\n" + css + "\n" + reduce + "\n")
    P = data["plum"]["P"]
    index, loose, broken = [], {}, []
    for row in P["index"]:
        sid = row["id"]
        copies = [data[th]["P"]["scr"][th].get(sid) for th in THEMES]
        if any(c is None for c in copies): broken.append(f"{sid}: missing in a theme"); continue
        parts = [COLOUR.split(c) for c in copies]
        cols = [COLOUR.findall(c) for c in copies]
        if any(p != parts[0] for p in parts) or any(len(c) != len(cols[0]) for c in cols):
            broken.append(f"{sid}: the four copies differ beyond colours"); continue
        res = [parts[0][0]]
        for k in range(len(cols[0])):
            tup = tuple(norm(c[k]) for c in cols)
            if len(set(tup)) == 1: v = cols[0][k]
            elif tup in by_tuple: v = f"var({by_tuple[tup]})"
            else:
                if tup not in loose: loose[tup] = [f"--pc-{len(loose) + 1}", 0, [c[k] for c in cols]]
                loose[tup][1] += 1; v = f"var({loose[tup][0]})"
            res.append(v); res.append(parts[0][k + 1])
        (out / f"{sid}.html").write_text("".join(res))
        index.append({"id": sid, "zone": row["z"], "title": row["t"], "en": P["en"].get(sid, [])})
    extra = "\n".join(f':root[data-theme="{th}"] {{ ' + " ".join(f"{n}: {vals[i]};" for n, _, vals in loose.values()) + " }" for i, th in enumerate(THEMES))
    (out / "tokens.css").write_text((out / "tokens.css").read_text() + "/* theme colours of the screens with no token in the archive (proto-extract.py) */\n" + extra + "\n")
    (out / "index.json").write_text(json.dumps({"zones": P["zones"], "screens": index, "icons": P["icon"]}, ensure_ascii=False, indent=1))
    # the icons as the screens draw them (<svg data-i="name">): one shape per name, checked
    icons = {}
    for f in sorted(out.glob("*.html")):
        for m in re.finditer(r'<svg data-i="([a-z0-9-]+)"[^>]*>(.*?)</svg>', f.read_text(), re.S):
            if icons.setdefault(m.group(1), m.group(2)) != m.group(2): broken.append(f"icon {m.group(1)}: two shapes")
    app_icons = shell / "proto-icons.gen.ts"
    app_icons.write_text("// The icons as the prototype's screens draw them (<svg data-i>; scripts/design/proto-extract.py). Do not edit by hand.\n"
                         "export const PROTO_ICONS: Record<string, string> = " + json.dumps(icons, ensure_ascii=False, indent=0, sort_keys=True) + ";\n")
    print(f"proto-extract: {len(icons)} icons -> {app_icons}")
    # the pictures the screens draw (scenes, the brand's mark): one per name, by the screen and the svg's viewBox or label
    picks = {"scene-feed": ("feed", 'viewBox="0 0 400 300"'), "scene-splash": ("splash", 'viewBox="0 0 400 420"'), "logo": ("splash", 'aria-label="sosed"')}
    art = {}
    for name, (sid, mark) in picks.items():
        m = re.search(r'<svg(?! data-i)([^>]*' + re.escape(mark) + r'[^>]*)>(.*?)</svg>', (out / f"{sid}.html").read_text(), re.S)
        if not m: broken.append(f"art {name}: no svg with {mark} in {sid}"); continue
        art[name] = {"viewBox": re.search(r'viewBox="([^"]+)"', m.group(1)).group(1), "body": m.group(2)}
    app_art = shell / "proto-art.gen.ts"
    app_art.write_text("// The prototype's pictures: scenes and the brand's mark (scripts/design/proto-extract.py). Do not edit by hand.\n"
                       "export const PROTO_ART: Record<string, { viewBox: string; body: string }> = " + json.dumps(art, ensure_ascii=False, indent=0, sort_keys=True) + ";\n")
    print(f"proto-extract: {len(art)} of {len(picks)} pictures -> {app_art}")
    # the prototype's keyframes, verbatim and the same in all four themes; where the app runs them is app/tokens/motion.css
    frames = {th: re.findall(r"@keyframes\s+[a-zA-Z-]+\s*\{(?:[^{}]*\{[^}]*\})*\s*\}", data[th]["html"]) for th in THEMES}
    if any(frames[th] != frames["plum"] for th in THEMES): broken.append("keyframes differ between the themes")
    # the press's inward shadow is rgba(var(--sh), …): one --sh per theme, in the prototype's theme blocks (sea, plum, black, white)
    sh = re.findall(r"--sh:\s*([0-9]+,\s*[0-9]+,\s*[0-9]+)", data["plum"]["html"])
    if len(sh) != len(THEMES): broken.append(f"--sh: {len(sh)} values for {len(THEMES)} themes")
    press_shadow = "".join(f':root[data-theme="{th}"] {{ --sh: {v}; }}\n' for th, v in zip(THEMES, sh))
    app_motion = tokens / "proto-motion.gen.css"
    app_motion.write_text("/* The prototype's keyframes, verbatim (scripts/design/proto-extract.py). Do not edit by hand; app/tokens/motion.css\n"
                          "   says which element runs which. */\n" + "\n".join(frames["plum"]) + "\n" + press_shadow)
    print(f"proto-extract: {len(frames['plum'])} keyframes -> {app_motion}")
    print(f"proto-extract: {len(index)} of {len(P['index'])} screens, {len(broken)} broken, {sum(n for _, n, _ in loose.values())} theme colours given their own token ({len(loose)} tokens --pc-*)")
    for b in broken: print("  BROKEN", b)
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
