#!/usr/bin/env python3
"""Build the flat mock-up sheets from their sources and the app kit.

    scripts/build-design-sheets.py            # write panel/design/<name>.svg for every source
    scripts/build-design-sheets.py --check    # build in memory, exit 1 if any built sheet differs
    scripts/build-design-sheets.py screen-03  # only the named sheets (parallel hands do not trip on each other)

Sources live in panel/design/sheets/*.svg and draw components with
    <use href="kit/components.svg#button-primary" x="16" y="700" data-w="343" data-label="Отправить"/>
The build replaces every such <use> with a <g transform="translate(x,y)"> holding
the symbol's children, so the output is a plain SVG.

Why not leave the <use> in place: measured 2026-09-19 in the Playwright image,
Chromium draws an external <use> but loads no @font-face for its text (neither
the sheet's nor the kit's own — the text falls back to a serif), and the text
inside it is invisible to the DOM (querySelectorAll('text') returns 0), so the
text gate would stop seeing it. The flat sheet keeps every existing tool working.

Parameters: a symbol declares defaults as data-p-<name>="value"; a <use> overrides
them with data-<name>="value". Inside the symbol, {name} is replaced by the value
and {expr} by the result of simple arithmetic over numeric parameters
(e.g. {w/2}, {w-44}). A symbol may also contain <g data-if="name"> blocks that
are kept only when the parameter is non-empty and not "0" (data-if="!name" — the opposite).
A sheet's <style> may hold the line /* kit:tokens */: it is replaced by
panel/design/kit/tokens.css, so the palette and the type steps live in one place.
"""
import ast
import operator
import re
import sys
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
DESIGN = ROOT / "panel" / "design"
SOURCES = DESIGN / "sheets"
SVG = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XLINK)

_libraries = {}


def library(path):
    if path not in _libraries:
        tree = ET.parse(path)
        _libraries[path] = {s.get("id"): s for s in tree.getroot().iter(f"{{{SVG}}}symbol")}
    return _libraries[path]


NUMBER = re.compile(r"^-?\d+(\.\d+)?$")
EXPR = re.compile(r"^[\w\s.+\-*/()]+$")


def fmt(v):
    return f"{v:g}" if isinstance(v, float) else str(v)


OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def arith(node, names):
    """Numbers, parameter names and + - * / only — no eval: the review panel of 2026-09-19
    showed that eval with empty builtins still reaches object attributes."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in names:
        return names[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](arith(node.left, names), arith(node.right, names))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -arith(node.operand, names)
    raise ValueError(f"не арифметика: {ast.dump(node)[:60]}")


def substitute(text, params, where):
    def one(m):
        key = m.group(1).strip()
        if key in params:
            return params[key]
        if not EXPR.match(key):
            raise SystemExit(f"✗ {where}: не понял подстановку {{{key}}}")
        names = {k: float(v) for k, v in params.items() if NUMBER.match(v)}
        try:
            return fmt(float(arith(ast.parse(key, mode="eval").body, names)))
        except Exception as e:
            raise SystemExit(f"✗ {where}: {{{key}}} — {e}")
    return re.sub(r"\{([^{}]+)\}", one, text)


def expand(element, params, where):
    """A deep copy of element with parameters substituted and data-if applied."""
    out = ET.Element(element.tag, {k: substitute(v, params, where) for k, v in element.attrib.items()
                                   if not k.startswith("data-p-") and k != "data-if"})
    out.text = substitute(element.text, params, where) if element.text else element.text
    out.tail = substitute(element.tail, params, where) if element.tail else element.tail
    for child in element:
        cond = child.get("data-if")
        if cond is not None:
            negate = cond.startswith("!")
            value = params.get(cond.lstrip("!"), "")
            present = value not in ("", "0")
            if present == negate:
                continue
        out.append(expand(child, params, where))
    return out


def resolve(element, base, where):
    """Replace every kit <use> below element, recursively (a symbol may use another)."""
    for i, child in enumerate(list(element)):
        href = child.get("href") or child.get(f"{{{XLINK}}}href") or ""
        if child.tag == f"{{{SVG}}}use" and "#" in href and not href.startswith("#"):
            file, _, ident = href.partition("#")
            lib_path = (base / file).resolve()
            if not lib_path.is_relative_to(DESIGN.resolve()):   # a href may not leave panel/design
                raise SystemExit(f"✗ {where}: {href} ведёт за пределы panel/design")
            symbols = library(lib_path)
            if ident not in symbols:
                raise SystemExit(f"✗ {where}: в {file} нет символа #{ident}")
            symbol = symbols[ident]
            params = {k[7:]: v for k, v in symbol.attrib.items() if k.startswith("data-p-")}
            params.update({k[5:]: v for k, v in child.attrib.items() if k.startswith("data-")})
            g = ET.Element(f"{{{SVG}}}g", {"data-kit": ident})
            x, y = child.get("x", "0"), child.get("y", "0")
            transform = f"translate({x},{y})"
            if child.get("transform"):
                transform = child.get("transform") + " " + transform
            g.set("transform", transform)
            for keep in ("opacity", "style", "class", "id", "data-max", "data-el"):   # data-max: the i18n length mark
                if child.get(keep):
                    g.set(keep, child.get(keep))
            body = expand(symbol, params, f"{where} #{ident}")
            g.text = body.text
            for part in body:
                g.append(part)
            g.tail = child.tail
            resolve(g, lib_path.parent, where)
            element.remove(child)
            element.insert(i, g)
        else:
            resolve(child, base, where)


TOKENS_MARK = "/* kit:tokens */"
SCHEMES_MARK = "/* kit:schemes */"


def build(source):
    text = source.read_text(encoding="utf-8")
    if TOKENS_MARK in text:   # the kit's tokens, typography and faces, shared by every sheet
        text = text.replace(TOKENS_MARK, (DESIGN / "kit" / "tokens.css").read_text(encoding="utf-8").strip())
    if SCHEMES_MARK in text:   # the other colour schemes: the kit sheet shows them, the screens do not need them
        text = text.replace(SCHEMES_MARK, (DESIGN / "kit" / "schemes.css").read_text(encoding="utf-8").rstrip())
    tree = ET.ElementTree(ET.fromstring(text))
    resolve(tree.getroot(), source.parent.parent, source.name)  # hrefs are written as seen from the built sheet in panel/design
    body = ET.tostring(tree.getroot(), encoding="unicode")
    note = f"<!-- Built by scripts/build-design-sheets.py from panel/design/sheets/{source.name} — edit the source, not this file. -->\n"
    return note + body + "\n"


def main():
    check = "--check" in sys.argv[1:]
    only = {a if a.endswith(".svg") else a + ".svg" for a in sys.argv[1:] if not a.startswith("--")}
    sources = sorted(s for s in SOURCES.glob("*.svg") if not only or s.name in only)
    if not sources:
        print("✗ исходников листов нет в panel/design/sheets"); sys.exit(3)
    stale = []
    for source in sources:
        built = build(source)
        target = DESIGN / source.name
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != built:
                stale.append(source.name)
        else:
            target.write_text(built, encoding="utf-8")
    if check:
        for s in stale:
            print(f"  ✗ {s}: собранный лист не совпадает с исходником — scripts/build-design-sheets.py")
        if stale:
            print(f"✗ листов: {len(sources)}, устаревших: {len(stale)}"); sys.exit(1)
        print(f"листов: {len(sources)} — все собраны из текущих исходников и кита")
    else:
        print(f"собрано листов: {len(sources)}")


if __name__ == "__main__":
    main()
