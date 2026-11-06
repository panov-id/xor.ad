#!/usr/bin/env python3
"""Build AUDIT.tsv: one row per archive family (MAP_EN.md ## Families).

Columns 1-6 are computed (parse + import graph + grep of node paths).
node_has is computed from node_calls vs routes registered in relay/node/src,
then overridden by reading (READ below). archive_needs comes only from READ;
a leading '?' means inferred from the screen name / LOST_SPOTS doc, not
confirmed by opening the archive HTML. Run: python3 -I build-audit.py
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MAP = ROOT / "docs/newdesign4/MAP_EN.md"
OUT = Path(__file__).resolve().parent / "AUDIT.tsv"
APP = ROOT / "app/src"
SDK = ROOT / "depth/core"
NODE = ROOT / "relay/node/src"
TOTAL_SCREENS = 283

# ---- 1. Families table -------------------------------------------------
def parse_families():
    rows, on = [], False
    for ln in MAP.read_text().splitlines():
        if ln.startswith("## Families"): on = True; continue
        if on and ln.startswith("## "): break
        if on and re.match(r"\| \d+ \|", ln):
            c = [x.strip() for x in ln.strip().strip("|").split("|")]
            rows.append(dict(base=c[0], screens=c[1], count=int(c[2]), base_id=c[3], app_file=c[4]))
    return rows

# ---- 2. node routes ------------------------------------------------------
def norm(p):
    p = re.sub(r"\$\{[^}]*\}", ":p", p).split("?")[0]
    return re.sub(r":\w+", ":p", p)

def node_routes():
    s = set()
    for f in NODE.rglob("*.ts"):
        t = f.read_text()
        for m in re.finditer(r'route\(\s*"([A-Z]+)",\s*"([^"]+)"', t):
            s.add((m[1], norm(m[2])))
        for m in re.finditer(r'"([A-Z]+) (/[^"\s]*)":', t):
            s.add((m[1], norm(m[2])))
    return s

# ---- 3. SDK client: method -> [(verb, path)] -----------------------------
def client_methods():
    t = (SDK / "client.ts").read_text()
    heads = [(m.start(), m[1]) for m in re.finditer(r"^  (?:async )?([a-zA-Z]+)(?:<[^>]*>)?\(", t, re.M)]
    out = {}
    for i, (pos, name) in enumerate(heads):
        body = t[pos: heads[i + 1][0] if i + 1 < len(heads) else len(t)]
        calls = [(m[1], norm(m[2])) for m in re.finditer(r'"(GET|POST|PUT|PATCH|DELETE)",\s*[`"](/[^`"]*)', body)]
        if calls: out[name] = calls
    return out

CALL_RE = re.compile(r'"(GET|POST|PUT|PATCH|DELETE)",\s*[`"](/[^`"]*)')
IMP_RE = re.compile(r'(?:from|import)\s*\(?\s*"([^"]+)"')
LEAF = {"i18n.ts", "i18n-core.ts", "router.ts", "main.tsx", "config.ts"}

def resolve(frm, spec):
    if spec.startswith("@sdk/"): base = SDK / spec[5:]
    elif spec.startswith("."): base = (frm.parent / spec).resolve()
    else: return None
    for suf in ("", ".ts", ".tsx", "/index.ts", "/index.tsx"):
        p = Path(str(base) + suf)
        if p.is_file() and p.suffix in (".ts", ".tsx"): return p
    return None

def closure(start, depth=2):
    seen, todo = set(), [(start, 0)]
    while todo:
        f, d = todo.pop()
        if f in seen: continue
        seen.add(f)
        if d >= depth: continue
        if f.name in LEAF and f != start: continue
        if f.name == "client.ts" or f.name.endswith(".test.ts"): continue
        for m in IMP_RE.finditer(f.read_text()):
            r = resolve(f, m[1])
            if r and (APP in r.parents or SDK in r.parents) and not r.name.endswith(".test.ts"):
                todo.append((r, d + 1))
    return seen

def main():
    fams = parse_families()
    routes, methods = node_routes(), client_methods()
    gen = {p.name for p in (APP / "nd4/screens").glob("*.gen.tsx")}
    cache = {}
    def scan(fpath):
        if fpath in cache: return cache[fpath]
        calls, imports_gen = set(), False
        own = fpath.read_text()
        # from_archive: the app file is a gen screen, or imports one directly
        imports_gen = fpath.name.endswith(".gen.tsx") or bool(re.search(r'nd4/screens/[\w-]+\.gen', own))
        for f in closure(fpath):
            t = f.read_text()
            for m in CALL_RE.finditer(t): calls.add((m[1], norm(m[2])))
            for name, cs in methods.items():
                if re.search(r"\.%s\(" % name, t): calls.update(cs)
        cache[fpath] = (calls, imports_gen)
        return cache[fpath]

    rows = []
    for f in fams:
        files = [] if f["app_file"] == "none" else [ROOT / x.strip() for x in f["app_file"].split(",")]
        calls, fromarch = set(), False
        for p in files:
            if not p.is_file(): continue
            c, g = scan(p)
            calls |= c; fromarch |= g
        # from_archive: a gen.tsx screen is imported by the app file itself or its imports
        known = sorted(c for c in calls if c in routes)
        unknown = sorted(c for c in calls if c not in routes)
        if not files: nh = "?"
        elif not calls: nh = "-"
        elif not unknown: nh = "yes"
        elif known: nh = "partial"
        else: nh = "no"
        node_calls = " ".join(f"{v} {p}" for v, p in sorted(calls)) or "-"
        if len(node_calls) > 400: node_calls = node_calls[:400] + "..."
        b = int(f["base"])
        ov = READ.get(b)
        need = "? not read (archive HTML not opened)"
        bid = f["base_id"]
        if nh == "?":
            if re.search(r"rules|help|wizard|empty|offline|zoom", bid): nh = "-"
            elif re.search(r"^(dots|checkers|chess|durak|hangman|tavli|domino|chapayev|reversi|four|battleship|poker)-", bid): nh = "yes"
            elif bid.startswith(("cab-sign", "cab-sent")): nh = "yes"
        if re.search(r"rules|help|wizard|empty|offline|zoom", bid) and not ov: need = "-"
        if ov:
            nh = ov[0] or nh
            need = ov[1]
        rows.append([f["base"], f["screens"], str(f["count"]), f["base_id"], f["app_file"],
                     "yes" if fromarch else "no", node_calls, nh, need])
    hdr = ["base", "screens", "count", "base_id", "app_file", "from_archive", "node_calls", "node_has", "archive_needs"]
    OUT.write_text("\n".join("\t".join(r) for r in [hdr] + rows) + "\n")

    yes = [r for r in rows if r[5] == "yes"]
    print(f"families: {len(rows)}; from_archive yes {len(yes)} / no {len(rows) - len(yes)}")
    cov = sum(int(r[2]) for r in yes)
    print(f"screens covered from archive: {cov} of {TOTAL_SCREENS} (sum of count all families = {sum(int(r[2]) for r in rows)})")
    for v in ("yes", "partial", "no", "-", "?"):
        print(f"node_has {v}: {sum(1 for r in rows if r[7] == v)}")
    unconf = sum(1 for r in rows if r[8] == "?" or r[8].startswith("?"))
    print(f"archive_needs unconfirmed ('?'): {unconf}")

# ---- reading: base -> (node_has override or None, archive_needs) ---------
# Basis: node routes in relay/node/src, docs/newdesign4/LOST_SPOTS_EN.md,
# inventory.csv titles. '?' prefix = inferred, archive HTML not opened.
GAMES = "-"
EXTRA_YES = (46, 52, 61, 62, 136, 137)  # routes exist: feed/hidden, likes/matches, POST /feed discount, /offers, /recovery/reissue
READ = {
 23: (None, "? map tiles, city labels, land/sea mask (client data, not node)"),
 32: ("yes", "-"),
 36: ("yes", "? own phrase 'on review' flag in feed answer"),
 37: ("yes", "? own phrase page: state, time left, extend (route /feed/:id/extend exists)"),
 38: ("partial", "? moderation verdict reason shown to the author (model verdict not returned to client)"),
 39: ("partial", "? faded own phrase kept for the author after fade"),
 41: (None, "-"),
 43: ("no", "text search over the feed (GET /feed has only lat/lon/radius/after)"),
 44: (None, "-"),
 45: ("no", "? public phrase page /l/<id> and faded-link state without keys"),
 49: (None, "-"),
 50: (None, "-"),
 60: (None, "-"),
 61: (None, "-"),
 62: (None, "-"),
 65: ("partial", "lost kind exists (db/089, mode in POST /feed); 3-day life per kind not confirmed"),
 66: ("no", "seen marks (point,time,line): new table; owner sees all, others dots without author"),
 67: ("no", "POST a seen mark without geolocation; fade after 3 days"),
 68: ("partial", "A4 flyer built on the device (photo never leaves); only phrase id/QR link needed"),
 69: ("no", "public page /l/<id>; anonymous mark write; per-device limit, captcha-lite"),
 70: ("partial", "POST /feed/:id/found exists; /l/<id> 'Found, thank you' public state missing"),
 71: ("no", "spot entity: name (checked as phrase), closed flag, term, cap"),
 74: ("no", "entry by code, membership row (spot,identity) with no list of people"),
 75: ("no", "closed spot feed separate from the street feed"),
 77: ("no", "organiser numbers only: scans, inside, phrases; live code rotation, paper code"),
 78: ("no", "pinned message <=140 chars + useful lines, checked as a phrase"),
 82: (None, "-"),
 85: ("partial", "? 'how neighbours see it' visibility option on POST /tables not confirmed"),
 86: (None, "-"),
 88: ("yes", "? game chat hide flag is client-side"),
 91: (None, "-"),
 94: ("partial", "? result reasons draw/left/timeout/paused/reconnect and move clock: only resign/nudge found in tables routes"),
 101: ("yes", "-"),
 102: ("partial", "? watch mode: spectator seat after 3 skipped turns exists; 'can watch' list flag not confirmed"),
 109: (None, "-"),
 114: ("partial", "? stickers in a chat of two: messages are ciphertext, sticker field only on table lines"),
 115: (None, "-"),
 125: (None, "-"),
 128: (None, "-"),
 129: ("-", "-"),
 132: ("no", "push/notification permission and subscription route (none in node)"),
 133: ("no", "per-kind notification settings stored per identity"),
 142: (None, "-"),
 146: ("no", "appeal route and state (mailer says no formal internal appeals body)"),
 147: ("-", "-"),
 148: (None, "-"),
 149: (None, "-"),
 152: ("yes", "-"),
 154: ("yes", "-"),
 157: ("no", "offer stats: views, opens, redemptions (no counters route in /adv)"),
 159: ("partial", "? account page: GET /adv/me exists; edit/close account not found"),
 268: ("no", "? ad panel slot data for wide screens (no route serves it)"),
 273: ("partial", "? ad-offer-gone state of /o/:code (stopped offer) not confirmed"),
}
def default_games():
    for n in (160,161,162,163,164,165,167,168,170,178,186,188,194,196,197,199,203,205,206,212,214,215,223,228,230,236,240,244,246,249,254,256,257):
        READ.setdefault(n, (None, "-"))
for _n in EXTRA_YES: READ.setdefault(_n, ("yes", "? none seen (archive HTML not opened)"))
default_games()

if __name__ == "__main__":
    main()
