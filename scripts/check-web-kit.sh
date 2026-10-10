#!/usr/bin/env bash
# Ratchet gate for the web kit (K3): screens, the cabinet (adv/) and App.tsx must not grow new raw
# <button>/<input>/<select>/<textarea>/<a> elements, nor className tokens that
# are not a `.ui-*` class defined in styles.css. Per-file counts are compared
# with web/kit-baseline.tsv (file<TAB>count): above baseline = red, equal or
# below = green (lower it with --update-baseline). Kit components (web/src/ui/*.tsx)
# are tags with a capital letter and never counted.
#
#   scripts/check-web-kit.sh                    check
#   scripts/check-web-kit.sh --update-baseline  rewrite web/kit-baseline.tsv
#
# WEB_ROOT points the gate at another copy of the web/ directory (probes use it).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export WEB_ROOT="${WEB_ROOT:-$here/../web}"
export MODE="${1:-check}"
case "$MODE" in check|--update-baseline) ;; *) echo "unknown flag: $MODE" >&2; exit 2 ;; esac
exec python3 -I - <<'PY'
import os, re, sys, glob
root = os.environ["WEB_ROOT"]; mode = os.environ["MODE"]
css = open(os.path.join(root, "src/styles.css"), encoding="utf-8").read()
vocab = set(re.findall(r"\.(ui-[A-Za-z0-9_-]+)", css))
if not vocab:
    print("check-web-kit: no .ui-* classes found in styles.css"); sys.exit(2)
files = sorted(glob.glob(os.path.join(root, "src/screens/*.tsx"))) + sorted(glob.glob(os.path.join(root, "src/adv/*.tsx"))) + [os.path.join(root, "src/App.tsx")]
tag_re = re.compile(r"<(button|input|select|textarea|a)(?=[\s/>])")

def strip_comments(t):  # keep length and newlines so offsets stay valid
    t = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), t, flags=re.S)
    return re.sub(r"(?<![:\"'`])//[^\n]*", lambda m: " " * len(m.group()), t)

def class_exprs(t):  # yield (offset, raw expression text) of each className=
    for m in re.finditer(r"\bclassName=", t):
        i = m.end()
        if i >= len(t): continue
        if t[i] in "\"'":
            j = t.find(t[i], i + 1); yield m.start(), t[i:(j + 1) if j > 0 else len(t)]
        elif t[i] == "{":
            d = 0; j = i
            while j < len(t):
                if t[j] == "{": d += 1
                elif t[j] == "}":
                    d -= 1
                    if d == 0: break
                j += 1
            yield m.start(), t[i + 1:j]

def tokens(expr):
    out = []
    for s in re.findall(r"\"([^\"]*)\"|'([^']*)'|`([^`]*)`", expr):
        lit = re.sub(r"\$\{[^}]*\}", " ", "".join(s))
        out += lit.split()
    return out

counts, hits, tags = {}, [], {}
for f in files:
    if not os.path.exists(f): continue
    rel = os.path.relpath(f, root)
    t = strip_comments(open(f, encoding="utf-8").read())
    line = lambda off: t.count("\n", 0, off) + 1
    n = 0
    for m in tag_re.finditer(t):
        n += 1; tags[m.group(1)] = tags.get(m.group(1), 0) + 1
        hits.append((rel, line(m.start()), f"raw <{m.group(1)}> outside kit"))
    for off, expr in class_exprs(t):
        bad = [x for x in tokens(expr) if x not in vocab]
        if bad:
            n += 1; tags["className"] = tags.get("className", 0) + 1
            hits.append((rel, line(off), f"className {' '.join(bad)!r} outside kit vocabulary"))
    counts[rel] = n

bpath = os.path.join(root, "kit-baseline.tsv")
if mode == "--update-baseline":
    with open(bpath, "w", encoding="utf-8") as fh:
        for k in sorted(counts): fh.write(f"{k}\t{counts[k]}\n")
    print("baseline written: " + ", ".join(f"{k}={v}" for k, v in sorted(tags.items())) + f"; total={sum(counts.values())}")
    sys.exit(0)

base = {}
if os.path.exists(bpath):
    for l in open(bpath, encoding="utf-8"):
        if "\t" in l:
            k, v = l.rstrip("\n").split("\t"); base[k] = int(v)
red = 0
for k, n in sorted(counts.items()):
    b = base.get(k, 0)
    if n > b:
        red += 1
        print(f"{k}: {n} raw occurrences, baseline {b}")
        for h in hits:
            if h[0] == k: print(f"{h[0]}:{h[1]}: {h[2]}")
if red:
    print(f"RED: {red} file(s) above the kit baseline (use ui/ components; --update-baseline only after a deliberate decrease)")
    sys.exit(1)
print(f"GREEN: {len(counts)} files within kit baseline, total {sum(counts.values())}/{sum(base.values())}")
PY
