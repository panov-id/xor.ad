#!/usr/bin/env python3
"""Brand themes as data -> CSS and a TS list (contract: docs/design/themes_EN.md).

Reads web/themes/<brand>/<id>.json (one flat token map per theme; the JSON
files are the truth), validates each, checks its contrast, and writes:

  web/src/themes.gen.css  [data-brand=X][data-theme=Y] { --bg: ...; ... } for
                          every theme, night-only files included, plus the
                          brand's light theme for an element with data-brand
                          but no data-theme yet (first paint before theme.ts).
  web/src/themes.gen.ts   per brand: the selectable themes (id, name, night)
                          and every theme's bg (for meta theme-color).

  scripts/design/themes-css.py            write both files
  scripts/design/themes-css.py --check    red if either file is stale
  --landing                               the second target: the colour variables and the
                                          button/field/link rules of the two landings
                                          (sosed.place/landing/index.html, neighbro.place/
                                          landing/index.html), written between the markers
                                          BEGIN kit ... END kit. With --check it compares the
                                          block variable by variable and rule by rule, and
                                          finds colour variables declared outside it. A
                                          sibling that is absent is skipped with a note.
                                          Siblings: group-root.sh, or SOSED_PLACE_DIR /
                                          NEIGHBRO_PLACE_DIR (a repository root) in the env.
  --themes DIR --out-dir DIR              point it elsewhere (its probe,
                                          scripts/test_themes-css.sh)

Red (exit 1): a missing or malformed token, a file whose brand/id disagrees
with its path, a "night" naming no theme of the brand, text under 4.5:1
(fg and fg-muted on bg and surface, accent-fg on accent), focus under 3:1
on bg and surface, or line under 3:1 on bg — a control's border is UI, and
docs/design/themes_EN.md asks UI for 3:1 (WCAG 1.4.11; sosed's dark themes carried 1.49:1
until 03.10.2026). WARN only, listed: accent as a fill under 3:1 on bg.
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
REQUIRED = ["bg", "surface", "surface-2", "fg", "fg-muted", "line", "accent", "accent-fg",
            "accent-text", "danger", "focus", "shadow", "tile-1", "tile-2", "tile-3", "tile-4"]
OPTIONAL = ["tile-5", "field"]  # neighbro has five tiles, sosed four; field: an input's ground (redesign 16.10.2026, tokens-next.json), the screens fall back to transparent
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def lum(hex_: str) -> float:
    def ch(c: float) -> float:
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a: str, b: str) -> float:
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def load(themes: pathlib.Path):
    errors, warns, brands = [], [], {}
    files = sorted(themes.glob("*/*.json"))
    if not files:
        errors.append(f"no theme files under {themes}")
    for f in files:
        where = f"{f.parent.name}/{f.name}"
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{where}: not JSON: {e}")
            continue
        for key in ("brand", "id", "name", "scheme", "tokens"):
            if key not in d:
                errors.append(f"{where}: missing field {key!r}")
        if any(k not in d for k in ("brand", "id", "name", "scheme", "tokens")):
            continue
        if d["brand"] != f.parent.name or d["id"] != f.stem:
            errors.append(f"{where}: brand/id {d['brand']}/{d['id']} disagree with the path")
        if d["scheme"] not in ("light", "dark"):
            errors.append(f"{where}: scheme {d['scheme']!r} is neither light nor dark")
        t = d["tokens"]
        for k in REQUIRED:
            if k not in t:
                errors.append(f"{where}: missing token {k!r}")
        for k, v in t.items():
            if k not in REQUIRED + OPTIONAL:
                errors.append(f"{where}: unknown token {k!r}")
            elif not isinstance(v, str) or not HEX.match(v):
                errors.append(f"{where}: token {k!r} is not #rrggbb: {v!r}")
        brands.setdefault(d["brand"], {})[d["id"]] = d
    if errors:
        return brands, errors, warns
    for brand, themes_ in brands.items():
        if "light" not in themes_:
            errors.append(f"{brand}: no light theme (the default by day)")
        for tid, d in themes_.items():
            where, t = f"{brand}/{tid}.json", d["tokens"]
            night = d.get("night")
            if night is not None and night not in themes_:
                errors.append(f"{where}: night {night!r} is no theme of {brand}")
            for fg, bgs, need in (("fg", ("bg", "surface"), 4.5), ("fg-muted", ("bg", "surface"), 4.5),
                                  ("accent-fg", ("accent",), 4.5), ("focus", ("bg", "surface"), 3.0),
                                  ("line", ("bg",), 3.0)):
                for bg in bgs:
                    r = ratio(t[fg], t[bg])
                    if r < need:
                        errors.append(f"{where}: {fg} on {bg} {r:.2f}:1 < {need}:1")
            for fg, bg in (("accent", "bg"),):
                r = ratio(t[fg], t[bg])
                if r < 3.0:
                    warns.append(f"{where}: {fg} on {bg} {r:.2f}:1 < 3:1 (known in the source palette)")
            ink = d.get("tile-ink")
            if ink is not None and not isinstance(ink, (list, dict)):
                errors.append(f"{where}: tile-ink is neither a list nor a map")
    return brands, errors, warns


def tile_inks(d: dict) -> dict:
    """--tile-N-ink: the map form names the ink per tile colour; the list form
    offers inks and the one with more contrast on the tile is taken."""
    ink, out = d.get("tile-ink"), {}
    for k, v in d["tokens"].items():
        if not k.startswith("tile-"):
            continue
        if isinstance(ink, dict) and v in ink:
            out[f"{k}-ink"] = ink[v]
        elif isinstance(ink, list) and ink:
            out[f"{k}-ink"] = max(ink, key=lambda c: ratio(c, v))
        else:
            out[f"{k}-ink"] = max(("#000000", "#ffffff"), key=lambda c: ratio(c, v))
    return out


def render(brands: dict) -> tuple[str, str]:
    head = "/* GENERATED by scripts/design/themes-css.py from web/themes/<brand>/*.json — do not edit. */\n"
    css = [head]
    for brand in sorted(brands):
        for tid in sorted(brands[brand]):
            d = brands[brand][tid]
            sel = f'[data-brand="{brand}"][data-theme="{tid}"]'
            if tid == "light":
                sel += f',\n[data-brand="{brand}"]:not([data-theme])'
            props = {**d["tokens"], **tile_inks(d)}
            body = "".join(f"  --{k}: {v};\n" for k, v in props.items())
            css.append(f"{sel} {{\n  color-scheme: {d['scheme']};\n{body}}}\n")
    ts = ["// GENERATED by scripts/design/themes-css.py from web/themes/<brand>/*.json — do not edit.\n",
          "export type ThemeEntry = { id: string; name: string; scheme: \"light\" | \"dark\"; night?: string };\n",
          "// The themes a person may choose, per brand (a file with \"section\": false is night-only).\n",
          "export const THEMES: Record<string, ThemeEntry[]> = {\n"]
    for brand in sorted(brands):
        ts.append(f"  {json.dumps(brand)}: [\n")
        for tid in sorted(brands[brand], key=lambda i: (i != "light", i != "dark", i)):
            d = brands[brand][tid]
            if d.get("section") is False:
                continue
            entry = {"id": tid, "name": d["name"], "scheme": d["scheme"]}
            if d.get("night"):
                entry["night"] = d["night"]
            ts.append(f"    {json.dumps(entry)},\n")
        ts.append("  ],\n")
    ts.append("};\n// Every theme's page colour, night-only ones included: meta theme-color.\n")
    ts.append("export const THEME_BG: Record<string, Record<string, string>> = {\n")
    for brand in sorted(brands):
        m = {tid: brands[brand][tid]["tokens"]["bg"] for tid in sorted(brands[brand])}
        ts.append(f"  {json.dumps(brand)}: {json.dumps(m)},\n")
    ts.append("};\n")
    return "".join(css), "".join(ts)


# ---------------------------------------------------------------------------
# The landings' target. Decided 10.10.2026 by quorum 2/2 (docs/facts/decisions.tsv,
# design.2026-10-10.landing-kit-generated): a generator writes the kit into each
# landing's index.html between markers; rejected: one shared kit.css linked or
# copied into both landings.

BEGIN = "/* BEGIN kit (generated by xor.ad scripts/design/themes-css.py --landing) */"
END = "/* END kit */"

# The one explicit mapping: the landing's variable name -> the web theme's token.
# The web names are bg/surface/line/...; the landings (and the shared screens of the
# web, styles.css line 7) say panel/border/muted/accent-ink. --muted-2 is --fg-muted
# as in the web (no second muted grey); --border is the line (3:1, the control rim),
# --ok does not exist: success is shown by word and the check mark, never by green.
LANDING_VARS = [
    ("bg", "bg"), ("panel", "surface"), ("panel-2", "surface-2"), ("border", "line"),
    ("fg", "fg"), ("muted", "fg-muted"), ("muted-2", "fg-muted"),
    ("border-control", "fg-muted"), ("err", "danger"),
]
LANDING_ACCENT = [("accent", "accent"), ("accent-ink", "accent-fg"), ("accent-text", "accent-text")]
LANDING_OWN = [n for n, _ in LANDING_VARS + LANDING_ACCENT] + ["ok"]

# Per landing: where the file is, how it names the light mode and an accent, and which
# web theme each of its accents is (light theme, night theme).
LANDINGS = {
    "sosed": {
        "repo": "sosed.place", "env": "SOSED_PLACE_DIR", "dialect": "theme-accent",
        "accents": [("terra", "light", "dark"), ("amber", "amber", "dark-amber"),
                    ("teal", "turquoise", "dark-turquoise"), ("azure", "azure", "dark-azure"),
                    ("violet", "violet", "dark-violet"), ("crimson", "carmine", "dark-carmine")],
        "default": "terra",
    },
    "neighbro": {
        "repo": "neighbro.place", "env": "NEIGHBRO_PLACE_DIR", "dialect": "mode-theme",
        # no data-theme = the web's default pair; teal is that same pair named
        "accents": [("teal", "light", "dark"), ("crimson", "crimson", "dark-crimson"),
                    ("azure", "azure", "dark-azure"), ("violet", "violet", "dark-violet")],
        "default": "teal",
    },
}
# Rules of web/src/styles.css taken verbatim, by exact selector, in file order.
KIT_SELECTORS = [
    # Since К6 the unavailable primary is also said by aria-disabled (kit_RU.md §2), one rule for both.
    ".ui-button", ".ui-primary", '.ui-primary:disabled, .ui-primary[aria-disabled="true"]', ".ui-secondary", ".ui-danger", ".ui-text",
    ".ui-field", ".ui-label", ".ui-input",
    '.ui-input[aria-invalid="true"], .ui-textarea[aria-invalid="true"]',
    '.ui-input[aria-disabled="true"], .ui-textarea[aria-disabled="true"]',
    ".ui-hint, .ui-reason, .ui-error", ".ui-error",
]
RULE = re.compile(r"(?m)^([^\s/@}{][^{}\n]*?)\s*\{([^{}]*)\}")


def css_rules(text: str) -> list[tuple[str, str]]:
    """Top-level rules as (selector, body with the whitespace collapsed)."""
    return [(" ".join(m[1].split()), " ".join(m[2].split())) for m in RULE.finditer(text)]


def kit_rules(src: pathlib.Path) -> list[str]:
    """The web kit's button/field/link rules as lines. The web says some of them on the
    bare elements (button, input, a: styles.css); the landing has its own buttons and
    inputs that must not change by the element, so the same declarations are put on
    .ui-button / .ui-input / .ui-link. Every other line is the web's own rule, verbatim."""
    web = css_rules((src / "styles.css").read_text(encoding="utf-8"))
    out, missing, by = [], [], {}
    for sel, body in web:
        by.setdefault(sel, []).append(body)
    for sel, to in (("button", ".ui-button"), ("input, select", ".ui-input"), ("a", ".ui-link")):
        if sel not in by:
            missing.append(sel)
        else:
            out.append((to, by[sel][0]))
    focus = [b for s, b in web if s.startswith("button:focus-visible, a:focus-visible, select:focus-visible")]
    if focus:
        out.append((".ui-button:focus-visible, .ui-input:focus-visible, .ui-link:focus-visible", focus[0]))
    else:
        missing.append("the focus ring rule")
    for sel in KIT_SELECTORS:
        if sel not in by:
            missing.append(sel)
        else:
            out.extend((sel, b) for b in by[sel])
    if missing:
        raise SystemExit(f"themes-css: RED — web/src/styles.css lacks the kit rules {missing}")
    return [f"{sel} {{ {body} }}" for sel, body in out]


def geometry(src: pathlib.Path) -> str:
    m = re.search(r"(?m)^:root \{[^{}]*\}", (src / "tokens.css").read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("themes-css: RED — web/src/tokens.css has no :root block")
    return " ".join(m.group(0).split())


def landing_vars(d: dict, names) -> str:
    return " ".join(f"--{n}: {d['tokens'][w]};" for n, w in names)


def landing_block(brand: str, brands: dict, src: pathlib.Path) -> str:
    cfg, themes_ = LANDINGS[brand], brands[brand]
    for _, light, night in cfg["accents"]:
        for tid in (light, night):
            if tid not in themes_:
                raise SystemExit(f"themes-css: RED — {brand}: no web theme {tid!r} for the landing")
    acc = {a: (themes_[l], themes_[n]) for a, l, n in cfg["accents"]}
    dflt_l, dflt_n = acc[cfg["default"]]
    lines = [BEGIN,
             f"/* Colours: web/themes/{brand}/*.json through LANDING_VARS and LANDINGS (themes-css.py).",
             "   Rules: web/src/styles.css; geometry: web/src/tokens.css. Edit those, not this. */",
             geometry(src)]
    both = LANDING_VARS + LANDING_ACCENT
    if cfg["dialect"] == "theme-accent":
        # No data-theme/data-accent yet (no script): the default accent as the fill and, as
        # the word, the fill itself - the accent-text of a theme is for a ground it knows.
        lines.append(":root { color-scheme: dark; %s %s --accent-text: var(--accent); }"
                     % (landing_vars(dflt_n, LANDING_VARS), landing_vars(dflt_n, LANDING_ACCENT[:2])))
        lines.append("@media (prefers-color-scheme: light) { :root { color-scheme: light; %s } }" % landing_vars(dflt_l, LANDING_VARS))
        lines.append(':root[data-theme="light"] { color-scheme: light; %s }' % landing_vars(dflt_l, LANDING_VARS))
        lines.append(':root[data-theme="dark"] { color-scheme: dark; %s }' % landing_vars(dflt_n, LANDING_VARS))
        for a, _, _ in cfg["accents"]:
            lines.append(':root[data-theme="light"][data-accent="%s"] { %s }' % (a, landing_vars(acc[a][0], LANDING_ACCENT)))
            lines.append(':root[data-theme="dark"][data-accent="%s"] { %s }' % (a, landing_vars(acc[a][1], LANDING_ACCENT)))
    else:
        lines.append(":root { color-scheme: dark; %s }" % landing_vars(dflt_n, both))
        lines.append('[data-mode="light"] { color-scheme: light; %s }' % landing_vars(dflt_l, both))
        for a, _, _ in cfg["accents"]:
            lines.append(':root:not([data-mode="light"])[data-theme="%s"] { %s }' % (a, landing_vars(acc[a][1], LANDING_ACCENT)))
            lines.append('[data-mode="light"][data-theme="%s"] { %s }' % (a, landing_vars(acc[a][0], LANDING_ACCENT)))
    lines += kit_rules(src)
    lines.append(END)
    return "\n".join(lines)


def group_root() -> pathlib.Path:
    out = subprocess.run(["bash", str(ROOT / "scripts/group-root.sh"), str(ROOT)],
                         capture_output=True, text=True)
    return pathlib.Path(out.stdout.strip()) if out.returncode == 0 and out.stdout.strip() else ROOT.parent


def landing_path(brand: str) -> pathlib.Path:
    cfg = LANDINGS[brand]
    base = os.environ.get(cfg["env"])
    base = pathlib.Path(base) if base else group_root() / cfg["repo"]
    return base / "landing" / "index.html"


def split_block(html: str):
    a, b = html.find(BEGIN), html.find(END)
    if a < 0 or b < a:
        return None
    return html[:a], html[a:b + len(END)], html[b + len(END):]


def parse_block(block: str) -> list[tuple[str, dict]]:
    """Every rule of the block as (selector, {property: value}); the @media wrapper is
    folded into the selector so a variable moved between modes is seen."""
    flat = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
    flat = re.sub(r"(@media\s*\([^)]*\))\s*\{\s*([^{}]*\{[^{}]*\})\s*\}",
                  lambda m: m.group(1) + " " + m.group(2), flat)
    out = []
    for m in re.finditer(r"([^{};]+)\{([^{}]*)\}", flat):
        props = {k.strip(): v.strip() for k, v in (d.split(":", 1) for d in m.group(2).split(";") if ":" in d)}
        out.append((" ".join(m.group(1).split()), props))
    return out


def diff_block(want: str, got: str) -> list[str]:
    errs, w, g, gd = [], parse_block(want), parse_block(got), {}
    for sel, props in g:
        gd.setdefault(sel, []).append(props)
    for sel, props in w:
        cands = gd.get(sel, [])
        if not cands:
            errs.append(f"rule missing: {sel}")
            continue
        have = cands.pop(0)
        for k, v in props.items():
            if have.get(k) != v:
                errs.append(f"{sel} {{ {k} }}: expected {v!r}, actual {have.get(k)!r}")
        for k in have:
            if k not in props:
                errs.append(f"{sel} {{ {k} }}: not in the generated block, actual {have[k]!r}")
    wsel = {s for s, _ in w}
    for sel in gd:
        if sel not in wsel:
            errs.append(f"rule not in the generated block: {sel}")
    return errs


def stray_colours(outside: str) -> list[str]:
    own = "|".join(re.escape(n) for n in LANDING_OWN)
    return [f"--{m.group(1)}: {m.group(2).strip()} declared outside the generated block (the colour is the theme's)"
            for m in re.finditer(rf"--({own})\s*:\s*([^;}}]+)", outside)]


TC_BEGIN = "/* BEGIN theme-color (generated by xor.ad scripts/design/themes-css.py --landing) */"
TC_END = "/* END theme-color */"
META_TC = re.compile(r'<meta name="theme-color" content="[^"]*">')
STRAY_TC = re.compile(r'setAttribute\("content",[^)]*#[0-9a-fA-F]{6}')


def theme_color(brand: str, brands: dict) -> tuple[str, str]:
    """The browser chrome colour: the page colour (bg) of the landing's light and dark default themes."""
    cfg = LANDINGS[brand]
    _, light, night = next(a for a in cfg["accents"] if a[0] == cfg["default"])
    return brands[brand][light]["tokens"]["bg"], brands[brand][night]["tokens"]["bg"]


def theme_color_sync(html: str, brand: str, brands: dict, check: bool) -> tuple[str, list[str]]:
    """<meta name=theme-color> and the JS table TC between the markers; hex in setAttribute is red."""
    light, dark = theme_color(brand, brands)
    want_js = f'{TC_BEGIN}var TC=window.__TC={{light:"{light}",dark:"{dark}"}};{TC_END}'
    want_meta = f'<meta name="theme-color" content="{dark}">'
    errs = []
    a, b = html.find(TC_BEGIN), html.find(TC_END)
    if a < 0 or b < a:
        return html, [f"no '{TC_BEGIN}' ... '{TC_END}' in the head script"]
    got_js = html[a:b + len(TC_END)]
    metas = META_TC.findall(html)
    if check:
        if got_js != want_js:
            errs.append(f"theme-color table: expected {want_js!r}, actual {got_js!r}")
        if metas != [want_meta]:
            errs.append(f"<meta theme-color>: expected {[want_meta]!r}, actual {metas!r}")
        errs += [f"hex colour in a theme-color setter: {m.group(0)}" for m in STRAY_TC.finditer(html)]
        return html, errs
    html = html[:a] + want_js + html[b + len(TC_END):]
    return META_TC.sub(want_meta, html), errs


def landing_target(brands: dict, check: bool) -> int:
    src, bad, notes = ROOT / "web/src", 0, []
    for brand in LANDINGS:
        path = landing_path(brand)
        if not path.exists():
            notes.append(f"SKIP {brand}: {path} is absent (sibling not checked out)")
            continue
        want = landing_block(brand, brands, src)
        html = path.read_text(encoding="utf-8")
        parts = split_block(html)
        if parts is None:
            print(f"  ✗ {brand}: {path} has no '{BEGIN}' ... '{END}' block")
            bad += 1
            continue
        head, got, tail = parts
        html2, tc_errs = theme_color_sync(html, brand, brands, check)
        if not check:
            if tc_errs:
                for e in tc_errs:
                    print(f"  ✗ {brand}: {e}")
                bad += 1
                continue
            parts = split_block(html2)
            head, got, tail = parts
        if check:
            errs = diff_block(want, got) + stray_colours(head + tail) + tc_errs
            if not errs and got != want:
                errs.append("the block differs from the generated one in text only (whitespace or comments)")
            for e in errs:
                print(f"  ✗ {brand}: {e}")
            if errs:
                print(f"    {path}: stale; run scripts/design/themes-css.py --landing")
                bad += 1
            else:
                notes.append(f"{brand}: block equals the web themes and kit rules")
        else:
            path.write_text(head + want + tail, encoding="utf-8")
            notes.append(f"wrote {brand}: {path}")
    for n in notes:
        print("  " + n)
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--landing", action="store_true", help="the landings' kit block instead of web/src outputs")
    ap.add_argument("--themes", default=str(ROOT / "web/themes"))
    ap.add_argument("--out-dir", default=str(ROOT / "web/src"))
    a = ap.parse_args()
    brands, errors, warns = load(pathlib.Path(a.themes))
    for w in warns:
        print(f"  WARN {w}")
    if errors:
        for e in errors:
            print(f"  ✗ {e}")
        print(f"themes-css: RED — {len(errors)} error(s)")
        return 1
    if a.landing:
        code = landing_target(brands, a.check)
        print(f"themes-css --landing: {'RED' if code else 'GREEN'}")
        return code
    css, ts = render(brands)
    out = pathlib.Path(a.out_dir)
    targets = {out / "themes.gen.css": css, out / "themes.gen.ts": ts}
    n = sum(len(v) for v in brands.values())
    if a.check:
        stale = [p.name for p, text in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            print(f"themes-css: RED — stale: {', '.join(stale)}; run scripts/design/themes-css.py")
            return 1
        print(f"themes-css: GREEN — {n} themes of {len(brands)} brands, outputs fresh, {len(warns)} known WARN")
        return 0
    for p, text in targets.items():
        p.write_text(text, encoding="utf-8")
    print(f"themes-css: wrote {len(targets)} files — {n} themes of {len(brands)} brands, {len(warns)} known WARN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
