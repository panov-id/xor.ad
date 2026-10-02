#!/usr/bin/env python3
"""Brand themes as data -> CSS and a TS list (contract: web/design/gen/themes.md).

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
  --themes DIR --out-dir DIR              point it elsewhere (its probe,
                                          scripts/test_themes-css.sh)

Red (exit 1): a missing or malformed token, a file whose brand/id disagrees
with its path, a "night" naming no theme of the brand, text under 4.5:1
(fg and fg-muted on bg and surface, accent-fg on accent) or focus under 3:1
on bg and surface. WARN only, listed: line under 3:1 on bg and accent (as a
fill) under 3:1 on bg — shortfalls the source palettes already carry and the
owner approved (themes.md); they are reported, not hidden.
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
REQUIRED = ["bg", "surface", "surface-2", "fg", "fg-muted", "line", "accent", "accent-fg",
            "accent-text", "danger", "focus", "shadow", "tile-1", "tile-2", "tile-3", "tile-4"]
OPTIONAL = ["tile-5"]  # neighbro has five tiles, sosed four
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
                                  ("accent-fg", ("accent",), 4.5), ("focus", ("bg", "surface"), 3.0)):
                for bg in bgs:
                    r = ratio(t[fg], t[bg])
                    if r < need:
                        errors.append(f"{where}: {fg} on {bg} {r:.2f}:1 < {need}:1")
            for fg, bg in (("line", "bg"), ("accent", "bg")):
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
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
