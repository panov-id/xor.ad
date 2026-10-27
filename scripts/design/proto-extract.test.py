#!/usr/bin/env python3
"""Tests of scripts/design/proto-extract.py: the prototype's screens, icons and pictures taken from the four theme
archives (docs/newdesing2) are what the repository holds, so a hand edit of a screen, of the app's icons or of the
themes, or an archive replaced and not extracted again, each fail.

    python3 -I scripts/design/proto-extract.test.py
"""
import filecmp
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
fails = 0


def check(name, ok, why):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f": {why}"))
    fails += 0 if ok else 1


with tempfile.TemporaryDirectory() as tmp:
    out, shell, tokens = Path(tmp, "proto"), Path(tmp, "shell"), Path(tmp, "tokens")
    run = subprocess.run([sys.executable, "-I", str(ROOT / "scripts/design/proto-extract.py"), str(ROOT / "docs/newdesing2"), str(out), str(shell), str(tokens)],
                         capture_output=True, text=True, cwd=ROOT)
    check("the extract runs clean", run.returncode == 0, run.stdout[-400:] + run.stderr[-400:])
    said = re.search(r"(\d+) of (\d+) screens, (\d+) broken", run.stdout)
    check("148 of 148 screens, 0 broken", said is not None and said.groups() == ("148", "148", "0"), said and said.groups())
    index = json.loads((out / "index.json").read_text())
    check("the index names every screen the archive has", len(index["screens"]) == 148 and all((out / f"{s['id']}.html").exists() for s in index["screens"]),
          len(index["screens"]))
    held = ROOT / "docs/newdesign/proto"
    cmp = filecmp.dircmp(out, held)
    check("docs/newdesign/proto is the archives' extract, file for file", not (cmp.left_only or cmp.right_only or cmp.diff_files),
          f"only fresh {cmp.left_only[:3]}, only held {cmp.right_only[:3]}, differ {cmp.diff_files[:3]}")
    check("app/tokens/themes.css is the extract's tokens.css", (ROOT / "app/tokens/themes.css").read_text() == (out / "tokens.css").read_text(),
          "themes.css drifted from the archives")
    for gen in ["proto-icons.gen.ts", "proto-art.gen.ts"]:
        check(f"app/src/shell/{gen} is the extract's", (ROOT / "app/src/shell" / gen).read_text() == (shell / gen).read_text(), f"{gen} drifted")
    check("app/tokens/proto-motion.gen.css is the extract's", (ROOT / "app/tokens/proto-motion.gen.css").read_text() == (tokens / "proto-motion.gen.css").read_text(), "proto-motion.gen.css drifted")
    motion = (tokens / "proto-motion.gen.css").read_text()
    names = re.findall(r"@keyframes ([a-zA-Z-]+)", motion)
    check("the prototype's 14 keyframes, each once", len(names) == 14 and len(set(names)) == 14, names)
    check("the press shadow --sh for each of the four themes", all(f':root[data-theme="{th}"] {{ --sh:' in motion for th in ("sea", "plum", "black", "white")), motion[-300:])
    icons = (shell / "proto-icons.gen.ts").read_text()
    drawn = {m for f in out.glob("*.html") for m in re.findall(r'data-i="([a-z0-9-]+)"', f.read_text())}
    check("every icon a screen draws is in the app's icons", all(f'"{n}":' in icons for n in drawn), sorted(n for n in drawn if f'"{n}":' not in icons)[:5])
sys.exit(1 if fails else 0)
