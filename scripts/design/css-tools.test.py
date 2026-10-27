#!/usr/bin/env python3
"""Tests of the three CSS helpers on a small tree of their own (a temp app/src and CSS), never on the app:
css-drop-class.py (drop rules by class prefix or name), css-unused.py (names no code uses, a run-time built name kept),
class-rename.py (rename words inside className strings only).

    python3 -I scripts/design/css-tools.test.py
"""
import subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
fails = 0


def check(name, ok, why=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f": {why}"))
    fails += 0 if ok else 1


def run(tmp, script, *args):
    r = subprocess.run([sys.executable, "-I", str(HERE / script), *args], cwd=tmp, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


with tempfile.TemporaryDirectory() as tmp:
    src = Path(tmp, "app/src"); src.mkdir(parents=True)
    (src / "A.tsx").write_text('export const A = () => <div className="k-a old-b">'
                               '<span className={`k-tone-${t}`} /><i className="old-b" /><b data-x="old-b" /></div>;\n')
    css = Path(tmp, "s.css")
    css.write_text(".k-a { color: red; }\n.old-b, .k-a b { margin: 0; }\n.old-c { margin: 1px; }\n"
                   "@media (min-width: 1px) { .old-c { padding: 0; } }\n.k-tone-1 { color: blue; }\n.k-gone { color: green; }\n")

    # css-unused: old-c and k-gone are used nowhere; k-tone-1 may be built by `k-tone-${t}` and is kept
    rc, out, err = run(tmp, "css-unused.py", "k-,old-", "s.css")
    got = set(filter(None, out.strip().split(",")))
    check("css-unused names exactly the unused", got == {"old-c", "k-gone"}, got)
    check("css-unused keeps a name built at run time and says so", "k-tone-1" not in got and "built at run time, kept: k-tone-1" in err, err)

    # css-drop-class: dropping old-c takes its rule and the @media left empty; old-b leaves the shared rule to .k-a b
    rc, out, err = run(tmp, "css-drop-class.py", "old-c", "s.css")
    t = css.read_text()
    check("css-drop-class drops the named class's rules, the empty @media too", ".old-c" not in t and "@media" not in t, t)
    rc, out, err = run(tmp, "css-drop-class.py", "old-", "s.css")
    t = css.read_text()
    check("css-drop-class by prefix keeps the other selectors of a shared rule", ".old-b" not in t and ".k-a b { margin: 0; }" in t, t)
    check("css-drop-class leaves other rules alone", ".k-a { color: red; }" in t and ".k-tone-1" in t, t)

    # class-rename: old-b becomes k-b inside className only; a data attribute keeps it; k-a=k-a+k-x adds a word
    rc, out, err = run(tmp, "class-rename.py", "old-b=k-b", "k-a=k-a+k-x")
    t = (src / "A.tsx").read_text()
    check("class-rename renames inside className strings", 'className="k-a k-x k-b"' in t and 'className="k-b"' in t, t)
    check("class-rename leaves other attributes alone", 'data-x="old-b"' in t, t)

print(f"css-tools: {fails} failed")
sys.exit(1 if fails else 0)
