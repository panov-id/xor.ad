#!/usr/bin/env python3
"""Cases for nd4-extract.py: python3 -I scripts/design/nd4-extract.test.py"""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("x", HERE / "nd4-extract.py")
X = importlib.util.module_from_spec(spec)
spec.loader.exec_module(X)
failed = 0


def check(name, ok, why=""):
    global failed
    failed += not ok
    print(("✓ " if ok else "✗ ") + name + ("" if ok else f" — {why}"))


rc = subprocess.run([sys.executable, "-I", str(HERE / "nd4-extract.py"), "--check"], capture_output=True, text=True)
check("generated files are fresh (--check)", rc.returncode == 0, rc.stdout.strip())

files = X.build()
gen = files[X.OUT_DIR / "place-map.gen.tsx"]
css = files[X.OUT_CSS]
# every color of the base screen is a token or the same in all 8 themes
left = {X.norm(c) for c in re.findall(r"#[0-9a-fA-F]{3,6}\b", re.sub(r"var\(--kit-[\w-]+, (#[0-9a-f]{6}|rgba?\([^)]*\))\)", "", gen)) if not c.startswith("#8cc3dc")}
table = X.color_table([23, 29])
themed = [c for c in left if len(set(table.get(c, {}).values())) > 1]
check("no themed color left as a literal", not themed, ", ".join(themed))
check("the device frame is not drawn (no 9:41, no island)", "9:41" not in gen and "110px" not in gen)
blocks = X.blocks(X.BASE_FILE)
check("283 screens in the archive file", len(blocks) == 283, str(len(blocks)))
texts = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()
check("screen 23 text is the archive's", texts(blocks[22]).startswith("9:41 Place ? Limassol Move the map 100 m 300 m 1 km"))
check("the optional block of 29 is behind p.wider", re.search(r"\{p\.wider && \(<div", gen) is not None)
# a token reused from nd4-themes.gen.css has the archive's value in every theme
known = X.known_tokens()
bad = [(c, k) for c, var in X.token_names(table, known).items() if var in ("var(--text)", "var(--text-muted)")
       for k, v in table[c].items() if known.get(k, {}).get(var[4:-1]) != v]
check("a reused token matches the archive in all 8 themes", not bad, str(bad[:3]))
amber = re.search(r':root\[data-theme="amber"\]\[data-time="day"\] \{([^}]*)\}', css)
check("amber day gets its own track color", amber is not None and "--kit-eadfd2: rgba(255,255,255,.55)" in amber[1])
# review panel 31.10
check("a color slot is wrapped once, not var(…, var(…))", "var(--kit-eadfd2, var(" not in gen)
check("night map background is the archive's whole fill (amber night mixes with #1d1530)",
      ':root[data-theme="amber"][data-time="night"] .nd-place-map .k-map { background:color-mix(in srgb,rgba(70,48,92,.66) 80%,#1d1530); }' in css)
check("the slider's keyboard focus is shown", ":focus-visible" in css)
check("the title is a heading", 'role="heading" aria-level={1}' in gen)
check("the screen background is taken whole per theme (kypros has the paper grain, golden none)",
      re.search(r'data-theme="limestone"\]\[data-time="day"\] \{[^}]*--kit-scr-bg:[^;]*url\("data:image/svg', css) is not None
      and re.search(r'data-theme="amber"\]\[data-time="day"\] \{[^}]*--kit-scr-bg:(?![^;]*url)', css) is not None)
tab = files[X.OUT_DIR / "place-map-tablet.gen.tsx"]
check("the tablet's screen is generated from the tablet file, without the frame and the app's rail",
      tab.startswith("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-tablet.html")
      and "9:41" not in tab and "export function PlaceMapScreenTablet(" in tab, tab[:120])
rail = re.findall(r'aria-label="([^"]+)"', X.blocks("kypros-tablet.html")[22].split("<div data-feed")[0])
check("the tablet's rail is not in the screen", rail != [] and not any(f'"{r}"' in tab for r in rail), str(rail))
check("the tablet keeps every handle the view drives",
      all(f'data-testid="{t}"' in tab for t in ("place-radius", "place-near", "place-here", "place-wider", "back")))
lap = files[X.OUT_DIR / "place-map-laptop.gen.tsx"]
check("the laptop's screen is generated from the laptop file", lap.startswith("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-laptop.html")
      and "export function PlaceMapScreenLaptop(" in lap, lap[:120])
check("the laptop keeps the handles and gives the panel's title and lead as data",
      all(f'data-testid="{t}"' in lap for t in ("place-radius", "place-near", "place-here", "place-lead"))
      and ">Your place<" not in lap and "Move the map under the pin" not in lap and "{p.title}" in lap and "{p.lead}" in lap)
nav = files[X.OUT_DIR.parent / "nav-laptop.gen.tsx"]
check("the laptop nav is the archive's <nav>, every tag made JSX", nav.startswith("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-laptop.html")
      and "class=" not in nav and "export function NavLaptop(" in nav, nav[:100])
check("the nav keeps the handles e2e drives", all(f'data-testid="{t}"' in nav for t in ("tab-feed", "tab-tables", "tab-chats", "tab-me", "rail-say")))
check("each tab says it is current", all(f"aria-current={{p.active === '{t}' ? 'page' : undefined}}" in nav for t in ("feed", "tables", "chats", "me")))
lt = X.color_table([23], "laptop")
nleft = [c for c in {X.norm(c) for c in re.findall(r"#[0-9a-fA-F]{3,6}\b", re.sub(r"var\(--kit-[\w-]+, (#[0-9a-f]{6}|rgba?\([^)]*\))\)", "", nav))}
         if len(set(lt.get(c, {}).values())) > 1]
check("no themed color left as a literal in the nav", not nleft, str(nleft))
check("archive text in a template string cannot run code", X.js_str("x${alert(1)} ⟦p.step⟧") == "`x\\${alert(1)} ${p.step}`", X.js_str("x${alert(1)} ⟦p.step⟧"))
check("archive text with a quote and a backslash stays one string", X.js_str("a 'b' c\\") == '"a \'b\' c\\\\"', X.js_str("a 'b' c\\"))
check("the kit css sets no rule on bare elements or the sheet's page", not re.search(r"(^|\})\s*(p|body|h2|\.board|\.lab)\{", css, re.M), "")
check("the press shrink is scoped to the archive's screens and nav", ":where(.scr,.nd-nav-laptop,.nd-nav-tablet) :is(.cta,.btn):active{" in css and ".cta:active,.btn:active" not in css)
check("the laptop frame puts the screen beside the nav and stretches the nav as the archive's row does",
      'main.nd-screen[data-width="laptop"] > .scr { position: absolute !important; left: var(--panel-left);' in css
      and 'main.nd-screen[data-width="laptop"] > .tabbar { left: var(--nd-gap); right: auto; top: var(--nd-gap); bottom: var(--nd-gap); flex-direction: row; align-items: stretch; }' in css)
def _unsafe(v):
    try:
        X.css_value(v); return False
    except SystemExit:
        return True
check("an archive css value cannot end a rule, import or pull a remote url",
      all(_unsafe(v) for v in ["red}body{x:1", "@import 'a'", "url(https://e.x/a.png)"])
      and not _unsafe("color-mix(in srgb,#8cc3dc 38%,#ebe5da)") and not _unsafe("url('data:image/png;base64,AA')".replace(";", "")))
tab = files[X.OUT_DIR.parent / "nav-tablet.gen.tsx"]
check("the tablet nav is generated from kypros-tablet.html screen 23, every tab live and named",
      "kypros-tablet.html screen 23" in tab and all(f'data-testid="tab-{t}"' in tab and f"aria-label={{p.labels.{t}}}" in tab for t in ("feed", "tables", "chats", "me"))
      and 'data-testid="rail-say"' in tab and "New phrase" not in tab and "Nearby" not in tab)
check("the tablet frame takes the archive's rail width and gap; the screen starts after them",
      '> .nd-nav-tablet { position: absolute; z-index: 3; left: 16px; top: 16px; bottom: 16px; width: 80px;' in css
      and ':has(> .nd-nav-tablet) > .scr { position: absolute !important; left: 112px;' in css)
for nav_name in ("nav-laptop.gen.tsx", "nav-tablet.gen.tsx"):
    g = files[X.OUT_DIR.parent / nav_name]
    check(f"{nav_name}: all 5 buttons pressable by pointer and keyboard (onClick, Enter/Space, tabIndex, role)",
          g.count("onClick={go(") == 5 and g.count("onKeyDown=") == 5 and g.count("tabIndex={0}") == 5 and g.count('role="button"') == 5)
for suffix in ("", "-tablet", "-laptop"):
    g = files[X.OUT_DIR / f"place{suffix}.gen.tsx"]
    r = files[X.OUT_DIR / f"place-row{suffix}.gen.tsx"]
    body = g.split("\n", 1)[1]
    check(f"place{suffix}: screen 22 with every part live, no archive words left",
          all(f'data-testid="{t}"' in g for t in ("back", "place-search", "place-chosen", "place-map-open", "place-found", "place-note", "place-here"))
          and g.count('data-testid="place-step"') == 4 and "{p.list}" in g and "{p.listShown && (" in g
          and not any(w in body for w in ("Molos", "Kafeneio", "Recent", "Where I am", "Street, area", ">Done<", "How far")))
    check(f"place-row{suffix}: the archive's «Recent» row, its words and press from props",
          "{p.name}" in r and "{p.sub}" in r and "onClick={p.onOpen}" in r and "Kafeneio" not in r.split("\n", 1)[1])
check("no radius chip is lit by its own style, only by [data-on]",
      all('"background": \'var(--accent)\'' not in c for c in re.findall(r'<span [^>]*data-testid="place-step"[^>]*>', files[X.OUT_DIR / "place.gen.tsx"])))
check("the lit radius chip takes the archive's 1 km chip", '.nd-place [data-testid="place-step"][data-on] { background: var(--accent) !important; color: #fff' in css)
check("a bare data-* attribute stays (the kit's css selects .wideapp[data-form])",
      'data-form=""' in X.to_jsx('<div class="wideapp" data-form style="height:100%"></div>', {})
      and 'data-form=""' in files[X.OUT_DIR / "update-laptop.gen.tsx"] and 'data-form=""' in files[X.OUT_DIR / "place-laptop.gen.tsx"])
check("the kit's style selectors are written as React renders a style (prop: value)",
      '.wideapp[data-form]>div[style*="position: absolute"]{bottom:auto!important}' in css and 'style*="position:absolute"' not in css)
check("a slot on the whole style attribute stays an expression",
      X.to_jsx('<span style="⟦p.on ? A : B⟧">', {}) == "<span style={p.on ? A : B}>", X.to_jsx('<span style="⟦p.on ? A : B⟧">', {}))
marks = [p.name for p in (HERE.parents[1] / "app/src/nd4").rglob("*.gen.*") if re.search("[⟦⟧⟪⟫]", p.read_text(encoding="utf-8"))]
check("no slot mark is left in any generated file", not marks, str(marks))
check("the tile that would ask the device for its place is gone at every width (owner 02.11)",
      not [n for n in ("place", "place-tablet", "place-laptop") if re.search("place-locate|Where I am now|onNow", (HERE.parents[1] / f"app/src/nd4/screens/{n}.gen.tsx").read_text(encoding="utf-8"))])
check("void elements are closed for JSX", X.to_jsx("<p>a<br>b</p>", {}) == "<p>a<br />b</p>")
try:
    X.to_jsx('<span onClick="⟦() => go()⟧">', {})
    check("a slot holding > is refused", False, "rendered")
except SystemExit as e:
    check("a slot holding > is refused", "'>'" in str(e), str(e))
check("the laptop frame's sizes are read off the archive", ":root:root { --rail-w: 232px; --nd-gap: 16px; }" in css)
orig = X.blocks
X.blocks = lambda name: [b.replace("Limassol", "⟦alert(1)⟧", 1) for b in orig(name)]
try:
    X.render("place-map", X.FAMILIES["place-map"], {})
    check("a slot marker in the archive is refused", False, "rendered")
except SystemExit as e:
    check("a slot marker in the archive is refused", "slot marker" in str(e), str(e))
X.blocks = orig
# texts mode (wizard 17-20): every archive text becomes p.t["<its English>"], the key list is written for the app
w1 = X.render("wizard-1", X.FAMILIES["wizard-1"], {})
check("texts mode: the archive's words become p.t keys", '{p.t["Say it to your street"]}' in w1 and ">Say it to your street<" not in w1)
check("texts mode: an entity in the archive is unescaped in the key",
      X.text_slots("tx", "<b>a &amp; b</b>") == '<b>⟦p.t["a & b"]⟧</b>' and "a & b" in X.TEXTS["tx"])
check("texts mode: the key list on disk is the generator's", json.loads((X.ROOT / "app/src/nd4/texts/wizard-1.en.json").read_text()) == sorted(X.TEXTS["wizard-1"]))
# the feed's quiet and offline blocks (41, 42): all actions wired, no archive word left, a width that differs is refused
fs = X.render_feed_states({})
check("feed states: actions wired, optional ones guarded", all(f'data-testid="{i}"' in fs for i in ("quiet", "error", "quiet-say", "wider", "retry")) and "{p.onWider && (" in fs and "{p.onSay && (" in fs, fs[:300])
check("feed states: no archive words left", not any(w in fs for w in ("Quiet around here", "No connection", "Try again", "Look further", "We’ll also")), "archive word in the output")
X.blocks = lambda name: [b.replace("Quiet around here", "Quiet here") if name == "kypros-laptop.html" else b for b in orig(name)]
try:
    X.render_feed_states({})
    check("feed states: widths that differ are refused", False, "rendered")
except SystemExit as e:
    check("feed states: widths that differ are refused", "differs over the widths" in str(e), str(e))
X.blocks = orig
# a table's row (79): slots wired, no archive word left, widths that differ are refused
tr = X.render_table_row({})
check("table row: slots wired, archive words gone", 'data-testid="table-open"' in tr and "{pips}" in tr and not any(w in tr for w in ("Durak", "450 m", ">sit<")), tr[:300])
X.blocks = lambda name: [b.replace("450 m · 3 of 4", "451 m · 3 of 4") if name == "kypros-laptop.html" else b for b in orig(name)]
try:
    X.render_table_row({})
    check("table row: widths that differ are refused", False, "rendered")
except SystemExit as e:
    check("table row: widths that differ are refused", "different rows" in str(e), str(e))
X.blocks = orig
# the tables' head and strip (79): wired, archive words gone, widths that differ are refused
th = X.render_tables_head({})
check("tables head: wired, archive words gone", all(f'data-testid="{i}"' in th for i in ("new-table", "tables-where", "tables-tab-all", "tables-tab-mine", "tables-strip")) and not any(w in th for w in ("Molos", "Tavli", ">All<", ">Mine<")), th[:300])
X.blocks = lambda name: [b.replace(">Mine<", ">Own<") if name == "kypros-laptop.html" else b for b in orig(name)]
try:
    X.render_tables_head({})
    check("tables head: widths that differ are refused", False, "rendered")
except SystemExit as e:
    check("tables head: widths that differ are refused", "the widths differ" in str(e), str(e))
X.blocks = orig
# the phone's bar (283): every tab of the app is wired, the current one's dot only on it, a changed tab count is refused
navp = X.render_nav_phone({})
check("nav phone: all 4 tabs wired, each with its dot flag", all(f'data-testid="tab-{t}"' in navp and "{" + t + "On && (" in navp for t in X.NAV_TABS.values()), navp[:300])
X.blocks = lambda name: [re.sub(r'<span style="flex:1;display:grid', '<b style="flex:1;display:grid', b, count=1) if name == X.BASE_FILE else b for b in orig(name)]
try:
    X.render_nav_phone({})
    check("nav phone: a different tab count is refused", False, "rendered")
except SystemExit as e:
    check("nav phone: a different tab count is refused", "tabs in the archive" in str(e), str(e))
X.blocks = orig
# the feed's head (283): the archive's row with the app's data, the sample words gone; widths that drift are refused
head = X.render_feed_head({})
check("feed head: the place, liked and help are wired, the sample words gone",
      all(w in head for w in ('data-testid="radius-open"', 'data-testid="seg-likes"', 'data-testid="feed-help"', "{p.name}", "{p.sub}", "{p.extra}"))
      and "Molos" not in head and "1 km" not in head, head[:300])
X.blocks = lambda name: [b.replace(">Molos<", ">Other<", 1) if name == "kypros-laptop.html" else b for b in orig(name)]
try:
    X.render_feed_head({})
    check("feed head: widths drawing different rows are refused", False, "rendered")
except SystemExit as e:
    check("feed head: widths drawing different rows are refused", "different rows" in str(e), str(e))
X.blocks = orig
# feed-own (36): the checking tile at three widths, its words and press from props, no fade line
for suffix in ("", "-tablet", "-laptop"):
    g = files[X.OUT_DIR / f"feed-own{suffix}.gen.tsx"]
    check(f"feed-own{suffix}: the handles kept, the sample words gone",
          all(w in g for w in ('data-testid="sent"', 'data-state="checking"', 'data-testid="sent-text"', "{p.status}", "{p.text}", "onClick={p.onOpen}"))
          and not any(w in g.split("\n", 1)[1] for w in ("checking ·", "Tavli")), g[:200])
# my-phrase (37): every part from props, the actions the node cannot serve behind a prop
for suffix in ("", "-tablet", "-laptop"):
    g = files[X.OUT_DIR / f"my-phrase{suffix}.gen.tsx"]
    check(f"my-phrase{suffix}: the handles kept, the sample words gone",
          all(f'data-testid="{t}"' in g for t in ("back", "text", "my-phrase-tag", "my-phrase-fade", "my-phrase-likes", "my-phrase-talks", "takedown", "my-phrase-keep"))
          and all(w in g for w in ("{p.talksShown && (", "{p.onKeep && (", "{p.onDelete && (", "{p.fadeShown && ("))
          and not any(w in g.split("\n", 1)[1] for w in ("Tavli", "yours · here", "fades in", "liked it", "talks opened", "You see how", "Keep 2 h", "Your phrase", "9:41")), g[:200])
check("my-phrase: the screen covers the app's talks pane, as the archive draws no pane", 'main.nd-screen[data-screen="my-phrase"] { position: fixed; inset: 0; z-index: 40;' in css)
# feed-empty (41, 42, 262): the quiet and offline blocks; 262 is 41 plus the ad slot (behind p.ad), so taking 41 covers it
_q = re.search(r'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 18px 70px">[\s\S]*?Look further · 3 km</span>', blocks[40])[0]
check("feed-empty: 262 draws 41's block as is, the only addition is the ad slot", _q in blocks[261] and "Ad slot" in blocks[261] and "Ad slot" not in blocks[40])
check("feed-empty: the quiet body holds the radius as data", "{p.body}" in fs and "1 km" not in fs and "pre-line" in fs.split("FeedOffline")[0])
# phrase-rejected (38): the sample words gone, the refusal's handle kept, the rules behind a prop
for suffix in ("", "-tablet", "-laptop"):
    g = files[X.OUT_DIR / f"phrase-rejected{suffix}.gen.tsx"]
    check(f"phrase-rejected{suffix}: the handles kept, the sample words gone",
          all(f'data-testid="{t}"' in g for t in ("rejected-text", "rejected-head", "refused", "rejected-delete", "rejected-edit", "rejected-rules")) and "{p.onRules && (" in g
          and not any(w in g.split("\n", 1)[1] for w in ("Selling", "Nothing is counted", "Not published", "Community rules", ">Delete", ">Edit", "9:41")), g[:200])
# phrase-faded (39; 272 draws 39 with the ad slot; 63 and 124 below)
for suffix in ("", "-tablet", "-laptop"):
    g = files[X.OUT_DIR / f"phrase-faded{suffix}.gen.tsx"]
    check(f"phrase-faded{suffix}: the handles kept, the sample words gone",
          all(f'data-testid="{t}"' in g for t in ("faded-line", "faded-again", "faded-new")) and "{p.onAgain && (" in g
          and not any(w in g.split("\n", 1)[1] for w in ("neighbours", "talks opened", "keep them", "Your phrase faded", "New phrase", "9:41")), g[:200])
    g = files[X.OUT_DIR / f"offer-exit{suffix}.gen.tsx"]
    check(f"offer-exit{suffix}: a real link to the redirect, the sample site gone",
          "<a href={p.goHref}" in g and 'rel="nofollow noopener noreferrer"' in g and all(f'data-testid="{t}"' in g for t in ("go", "exit", "domain", "report"))
          and not any(w in g.split("\n", 1)[1] for w in ("kalinda", "Nobody on sosed", "Leaving sosed")), g[:200])
    g = files[X.OUT_DIR / f"chat-ended{suffix}.gen.tsx"]
    check(f"chat-ended{suffix}: the handles kept, the sample words gone",
          all(f'data-testid="{t}"' in g for t in ("tombstone", "show-safety", "chat-to-talks")) and not any(w in g.split("\n", 1)[1] for w in ("It faded", "Back to talks", "The talk has", "Safety tips")), g[:200])
_mid = lambda n: re.search(r'<div style="margin:auto 0;[\s\S]*?</p>', blocks[n - 1])[0]
check("phrase-faded: 272 draws 39's middle as is, the only addition is the ad slot", _mid(39) in blocks[271] and "Ad slot" in blocks[271] and "Ad slot" not in blocks[38])
check("chat-ended: 267 draws 124's middle as is, the only addition is the ad slot", _mid(124) in blocks[266] and "Ad slot" in blocks[266] and "Ad slot" not in blocks[123])
# the ad screens 261..272 (owner 02.11.2026: behind one flag, not visible to people): a slot is drawn only when the screen is given p.ad,
# the app gives it only with the flag on (ads.test.ts); the set of slots is read from the code (ads-logic.ts) and the archive
_ads_logic = (X.ROOT / "app/src/shell/ads-logic.ts").read_text()
_places = set(re.findall(r'place: "([^"]+)"', _ads_logic))
_archive = {n: set(re.findall(r'data-ad="([^"]+)"', blocks[n - 1])) for n in (261, 262, 263, 267, 271, 272)}
check("ads: the app's slots are the archive's six screens' slots, N of M", set().union(*_archive.values()) == _places | {"feed-native"} and len(_places) == 5,
      f"archive {sorted(set().union(*_archive.values()))} app {sorted(_places)}")
_guarded = [("feed-states", "FeedQuiet"), ("my-marks-empty", "MyMarksEmpty"), ("chat-ended", "ChatEnded"), ("chat-ended-tablet", "ChatEnded"), ("chat-ended-laptop", "ChatEnded"),
            ("phrase-faded", "PhraseFaded"), ("phrase-faded-tablet", "PhraseFaded"), ("phrase-faded-laptop", "PhraseFaded"), ("ad", "AdSlot")]
for _f, _c in _guarded:
    g = files[X.OUT_DIR / f"{_f}.gen.tsx"]
    body = g.split("export function AdNative")[0] if _f == "ad" else g
    marks = [m.start() for m in re.finditer(r"data-ad=", body)]
    check(f"ads: {_f} draws its slot only behind p.ad, with the slot's words as data",
          len(marks) == 1 and body.rfind("{p.ad && (", 0, marks[0]) > body.rfind("</", 0, marks[0]) - 10_000 and "ad?: { id: string;" in body
          and not any(w in body.split("\n", 1)[1] for w in ("Ad slot", "320×", "quiet feed", "under Liked", "talk ended", "phrase faded", "nothing liked")),
          body[:160])
    check(f"ads: {_f}: no slot markup outside the guard", re.sub(r"\{p\.ad && \([\s\S]*?\n?\s*\)\}", "", body, count=1).count("data-ad") == 0 if _f == "ad" else body.count("data-ad=") == body.count("{p.ad && ("), body[:120])
_nat = files[X.OUT_DIR / "ad.gen.tsx"].split("export function AdNative")[1]
check("ads: the sponsored tile (261) keeps the archive's frame and takes its words as data", 'data-ad="feed-native"' in _nat and not any(w in _nat for w in ("Sponsored", "Fresh bread", "same size")) and "{p.text}" in _nat)
# offer-card (62): the distance's separator is text inside a condition, so it needs a fragment or the file does not parse
_o = files[X.OUT_DIR / "offer-card.gen.tsx"]
check("offer-card: the dot before the distance stands in a fragment", "{p.dist && (<> · {p.dist}</>)}" in _o, _o[:200])
check("offer-card: the archive's sample words are gone", not any(w in _o for w in ("Kalinda", "for two on coffee", "Weekdays 14:00", "Say it with this offer")), _o[:200])
# feed-loading (40): the ghost columns of each file, a glint on every ghost, no list of old cards
for suffix, cols in (("", 2), ("-tablet", 3), ("-laptop", 4)):
    g = files[X.OUT_DIR / f"feed-loading{suffix}.gen.tsx"]
    check(f"feed-loading{suffix}: {cols} columns of ghosts, each with the glint, the handle kept",
          'data-testid="loading"' in g and g.count('className="tile"') == cols * 4 and g.count('className="kwait"') == cols * 4 and "9:41" not in g, g[:200])
check("screen 63 at the laptop leaves the nav visible", 'main.nd-screen[data-width="laptop"][data-screen="offer"] { left: var(--panel-left);' in css and 'main.nd-screen[data-width="laptop"][data-screen="offer"] > .scr { left: 0; }' in css)
check("the screens drawn alone cover the app", '[data-screen="phrase-rejected"], [data-screen="phrase-faded"], [data-screen="offer"]) { position: fixed;' in css)
# my-marks (49) and my-marks-empty (50): one drawing on all widths, the words from props, the handles e2e and back-walk drive kept
g = files[X.OUT_DIR / "my-marks.gen.tsx"]
check("my-marks: back, the card, the hand and the note wired, the sample words gone",
      all(w in g for w in ('data-testid="likes-back"', 'data-testid="liked-card"', 'data-testid="unlike"', 'data-testid="spent"', "onClick={p.off ? undefined : p.onUnlike}", "{p.title}", "{p.count}", "{p.text}", "p.fade"))
      and not any(w in g.split("\n", 1)[1] for w in ("Liked", "4 still here", "350 m", "Swim at 7", "you liked", "70%")), g[:200])
g = files[X.OUT_DIR / "my-marks-empty.gen.tsx"]
check("my-marks-empty: the handles kept, the words from props, the sample words gone",
      all(w in g for w in ('data-testid="quiet"', 'data-testid="likes-go"', "onClick={p.onGo}", "{p.title}", "{p.before}", "{p.after}", "{p.goText}"))
      and not any(w in g.split("\n", 1)[1] for w in ("Nothing liked", "Tap ", "It stays", "See phrases")), g[:200])
# card-in (51) and card-both (52): a frame per width, the handles e2e and crowd.mjs drive kept, the sample words gone
g = files[X.OUT_DIR / "card-in.gen.tsx"]
check("card-in: back, «…», the phrase, both hands and the note wired, three mode icons, the sample words gone",
      all(w in g for w in ('data-testid="back"', 'data-testid="more-menu"', 'data-testid="text"', 'data-testid="like"', 'data-testid="unlike"', "data-lit", "p.onUnlike", "p.onLike", "{p.children}", "{p.dist}", "{p.text}", "{p.fadeText}", "p.testid", "export function CardFrameTablet", "export function CardFrameLaptop"))
      and all(f"{{p.{m} && (" in g for m in ("alone", "friend", "group", "language"))
      and not any(w in g.split("\n", 1)[1] for w in ("350 m", "Anyone up", "fades in", "comes alone", "3 likes", "Liked.", "9:41")), g[:200])
check("card-in: the tablet's rail and pane stand in the card's frame", 'main[data-screen="card"][data-width="tablet"] > .nd-nav-tablet' in css and 'main[data-screen="card"][data-width="tablet"] > .scr' in css)
g = files[X.OUT_DIR / "card-both.gen.tsx"]
check("card-both: the matched line and the talk wired, the sample words gone",
      all(w in g for w in ('data-testid="matched"', 'data-testid="talk"', "onClick={p.onTalk}", "{p.line}", "{p.name}", "{p.talkText}"))
      and not any(w in g.split("\n", 1)[1] for w in ("You both liked", "Eleni", "Open talk")), g[:200])
# card-need (53) and card-more (54): the archive's dim and sheet, two drawings, the handles e2e and crowd.mjs drive kept, the sample words gone
g = files[X.OUT_DIR / "card-need.gen.tsx"]
check("card-need: the sheet's words from props, «later» and «write» wired, a phone and a wide drawing, the sample words gone",
      all(w in g for w in ('data-testid="card-need"', 'data-testid="need-phrase"', 'data-testid="need-say"', 'data-testid="need-later"', "onClick={p.onSay}", "onClick={p.onClose}", "{p.title}", "{p.text}", "{p.laterText}", "{p.sayText}", "export function CardNeedSheetWide", "pre-line"))
      and not any(w in g.split("\n", 1)[1] for w in ("Say something", "To like", "Not now", "Write a phrase", "Anyone up")), g[:200])
g = files[X.OUT_DIR / "card-more.gen.tsx"]
check("card-more: hide, notice, block and cancel wired, the error's slot, a phone and a wide drawing, the sample words gone",
      all(w in g for w in ('data-testid="card-more"', 'data-testid="hide"', 'data-testid="notice"', 'data-testid="block"', 'data-testid="more-cancel"', "p.onHide", "p.onNotice", "p.onBlock", "onClick={p.onClose}", "{p.error}", "{p.hideText}", "{p.hideSub}", "{p.noticeSub}", "{p.blockSub}", "{p.cancelText}", "export function CardMoreSheetWide"))
      and not any(w in g.split("\n", 1)[1] for w in ("Hide this", "undo for", "Report", "what’s wrong", ">Block", "tables disappear", ">Cancel", "Anyone up")), g[:200])
check("sheets: the shell's layer steps aside for a sheet from the archive", ".layer-sheet:has(> .wpop){inset:0" in css and ".layer-sheet > .wpop) .dim{opacity:0}" in css)
# empty-panel (44) and feed-hidden (46): one drawing on all widths, every word from props, the handles kept
g = files[X.OUT_DIR / "empty-panel.gen.tsx"]
check("empty-panel: the title and the hint from props, the sample words gone, the bubble kept",
      "{p.title}" in g and "{p.hint}" in g and "pre-line" in g and 'data-testid="pane-hint"' in g and "M8 9H40V31H22" in g
      and not any(w in g.split("\n", 1)[1] for w in ("Nothing open", "Pick a phrase", "9:41")), g[:200])
g = files[X.OUT_DIR / "feed-hidden.gen.tsx"]
check("feed-hidden: the handles e2e drives kept, the bar runs, the sample words gone",
      all(w in g for w in ('data-testid="gone"', 'data-why="hidden"', 'data-testid="hidden-undo"', "onClick={p.onUndo}", "{p.text}", "{p.undoText}", "nd4-undo-run", "p.ms"))
      and not any(w in g.split("\n", 1)[1] for w in ("Phrase hidden", ">Undo", "64%")), g[:200])
_orig = X.blocks
X.blocks = lambda name: [b.replace("Phrase hidden", "Phrase hidden!", 1).replace("!<", "<", 1).replace("padding:14px 14px 16px 18px", "padding:1px") if name == "kypros-laptop.html" else b for b in _orig(name)]
try:
    X.render_feed_hidden({})
    check("feed-hidden: widths drawing different toasts are refused", False, "rendered")
except SystemExit as e:
    check("feed-hidden: widths drawing different toasts are refused", "different blocks" in str(e), str(e))
X.blocks = lambda name: [b.replace("It opens here.", "Opens here.") if name == "kypros-tablet.html" else b for b in _orig(name)]
try:
    X.render_empty_panel({})
    check("empty-panel: a width that lost the block is refused", False, "rendered")
except SystemExit as e:
    check("empty-panel: a width that lost the block is refused", "not found" in str(e), str(e))
X.blocks = _orig
# colors over ALL generated files and ALL themes (panel 02.11): read from the disk, so a new file or theme is in the set by itself
WIRED = {n for f in X.FAMILIES.values() for n in [f["base"], *f.get("optional", {})]} | {X.FEED_SCREEN, 36, 40, 44, 46, 49, 50, 51, 52, 53, 59, 79, 124}
NUMS = sorted(set(X.raw_ids()) | {n for f in X.FAMILIES.values() for n in [f["base"], *f.get("optional", {})]} | {X.FEED_SCREEN, 36, 40, 44, 46, 49, 50, 51, 52, 53, 59, 79, 124})
gens = sorted(X.OUT_DIR.parent.rglob("*.gen.tsx"))
css_disk = X.OUT_CSS.read_text()
theme_css = {(m[1], m[2]): m[3] for m in re.finditer(r':root\[data-theme="(\w+)"\]\[data-time="(\w+)"\] \{([^}]*)\}', css_disk)}
check("the kit css has all 8 themes", len(theme_css) == 8, str(len(theme_css)))
defined = {k: dict(re.findall(r"(--kit-[\w-]+):\s*([^;]+);", v)) for k, v in theme_css.items()}
used = {u for g in gens for u in re.findall(r"var\((--kit-[\w-]+)", g.read_text(encoding="utf-8"))} | set(re.findall(r"var\((--kit-[\w-]+)", css_disk))
holes = sorted(u for u in used if any(u not in d for d in defined.values()))
check(f"each of {len(used)} --kit tokens used is defined in all 8 themes", not holes, ", ".join(holes[:8]))
names_all = X.all_names(NUMS)
THEMES_ALL = names_all.themes
same_somewhere = set()
for dev in X.ALL_DEVICES:
    for _, t, per in X.walk_places(NUMS, dev):
        for prop, v in X.tag_decls(t).items():
            vals = [(per.get(th) or {}).get(prop) for th in THEMES_ALL]
            if all(o and X.COLOR.sub("C", o) == X.COLOR.sub("C", v) for o in vals):
                for i, c in enumerate(X.COLOR.findall(v)):  # this color at this position is one value in all 8 themes
                    if len({X.norm(X.COLOR.findall(o)[i]) for o in vals}) == 1:
                        same_somewhere.add(X.norm(c))
def strip_vars(text):
    prev = None
    while prev != text:
        prev, text = text, re.sub(r"var\(--[\w-]+(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)", "", text)
    return text
raw = sorted({f"{g.name}:{X.norm(c)}" for g in gens for c in X.COLOR.findall(strip_vars(g.read_text(encoding="utf-8").partition("\n")[2])) if X.norm(c) not in same_somewhere})
check(f"no themed literal outside var() in {len(gens)} generated files", not raw, ", ".join(raw[:8]))
chips = (X.OUT_DIR / "tables-head.gen.tsx").read_text(encoding="utf-8")
chip_lines = [l for l in chips.split("\n") if l.startswith("const CHIP_")]
check("the game chip's colors go through the tokens", len(chip_lines) == 2 and 'color: "var(--' in chip_lines[0] and 'background: "var(--accent)"' in chip_lines[1], str(chip_lines)[:300])
# every place shows the archive's color: the value resolved for a tag, spelled out in a theme, equals that tag in the theme's file
known_all = X.known_tokens()
def spell(v, th):
    prev = None
    while prev != v:
        prev = v
        def one(m):
            n = m[1]
            if n in names_all.extra:
                return names_all.extra[n][th]
            for c, var in names_all.items():
                if var.startswith(f"var({n}") and (var[len(n) + 4] in ",)"):
                    return names_all.table[c][th]
            return known_all.get(th, {}).get(n) or m[0]
        v = re.sub(r"var\((--[\w-]+)(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)", one, v)
    return v
squash = lambda v: X.COLOR.sub(lambda m: X.norm(m[0]), v.replace(" ", "").replace("'", '"').lower())
wrong, total = [], 0
for dev in X.ALL_DEVICES:
    for n, t, per in X.walk_places(NUMS, dev):
        for prop, v in X.tag_decls(t).items():
            if not X.COLOR.search(v) or X.norm(X.ACCENT) in v:
                continue
            got = names_all.resolve(t, prop, v)
            for th in THEMES_ALL:
                if per.get(th) is None or prop not in per[th]:
                    continue
                total += 1
                if squash(spell(got, th)) != squash(per[th][prop]):
                    wrong.append(f"{dev} {n} {th} {prop}: {spell(got, th)[:50]} != {per[th][prop][:50]} | {t[:50]}")
listed = len(names_all.minority)
# wired screens stay exact; the raw pass (owner /go 06.11) carries a debt that may only shrink as families wire screens
RAW_COLOR_DEBT = 392
raw_wrong = [w for w in wrong if int(w.split(" ")[1]) not in WIRED]
wrong = [w for w in wrong if int(w.split(" ")[1]) in WIRED]
check(f"each of {total} themed places shows the archive's color; the rest is at most the {listed} lines of --colors", listed <= 8 and all(w.split(" ")[1] in ("46", "79") and "<svg" in w for w in wrong), f"{len(wrong)}: " + "; ".join(wrong[:3]))
check(f"raw screens off the archive's color: {len(raw_wrong)}, at most {RAW_COLOR_DEBT}", len(raw_wrong) <= RAW_COLOR_DEBT, "; ".join(raw_wrong[:3]))
print(f"places {total}, off the archive {len(wrong)}, listed {listed}")
miss = X.orphans(X.build())
check("no orphan .gen.tsx on disk", not miss, ", ".join(miss))
fake = dict(files)
gone = X.OUT_DIR / "place-row.gen.tsx"
fake.pop(gone)
check("an orphan .gen.tsx is flagged", str(gone.relative_to(X.ROOT)) in X.orphans(fake), str(X.orphans(fake)))
check("to_jsx keeps an empty fragment open", X.to_jsx("⟪ad⟫<><i></i></>⟪/⟫", {}).startswith("{p.ad && (<>"), X.to_jsx("⟪ad⟫<><i></i></>⟪/⟫", {}))
try:
    X.ad_splice("<a></a>", "<a><b></a>", "unbalanced")
    refused = False
except SystemExit as e:
    refused = "not balanced" in str(e)
check("ad_splice refuses a block that is not closed", refused)
# the raw pass (owner /go 06.11): every screen the inventory lists, at every width, generated from that screen
ids = X.raw_ids()
raw = {p.name: t for p, t in files.items() if p.parent == X.RAW_DIR}
want = {f"s{n:03d}-{sid}-{w}.gen.tsx": (n, src) for n, sid in ids.items() for w, src in X.RAW_FILES}
lost = sorted(set(want) - set(raw))
check(f"raw pass: {len(want) - len(lost)} of {len(want)} screen files ({len(ids)} screens x {len(X.RAW_FILES)} widths)", not lost and len(ids) == 283, ", ".join(lost[:5]))
wrong = [k for k, (n, src) in want.items() if k in raw and f"screens/{src} screen {n} " not in raw[k].split("\n", 1)[0]]
check("raw pass: each file's head names its archive file and screen", not wrong, ", ".join(wrong[:5]))
check("raw pass: no archive <script> left in JSX", not [k for k, t in raw.items() if "<script" in t])
print(f"{'FAIL' if failed else 'OK'}: {failed} failed")
sys.exit(1 if failed else 0)
