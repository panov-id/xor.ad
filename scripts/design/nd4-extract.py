#!/usr/bin/env python3
"""Screens of docs/newdesign4 taken as is: markup of an archive screen -> a generated React component.

Owner 31.10.2026: «Ты не умеешь брять из сверстоного хтмл, цсс и скрипты чтобы применить к дизайну?» So the
markup, inline styles and classes come from kypros-phone.html untouched; only data is put in (texts, the
step of the radius, handlers), named in FAMILIES below. Colors become CSS variables: each archive color is
looked up in the same place of the 7 other theme files, and the values per theme are written as tokens
(app/tokens/nd4-kit.css), reusing a token of nd4-themes.gen.css when its value matches in every theme.

  python3 -I scripts/design/nd4-extract.py          write the files
  python3 -I scripts/design/nd4-extract.py --check  exit 1 when the files differ from a fresh run
"""
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "docs/newdesign4/kit/sosed-design-2026-10-29"
SCREENS = KIT / "screens"
THEMES = {"kypros": "limestone", "golden": "amber", "ceramic": "marble", "paper": "chalk"}
BASE_FILE = "kypros-phone.html"
TOKENS = ROOT / "app/tokens/nd4-themes.gen.css"
OUT_CSS = ROOT / "app/tokens/nd4-kit.css"
OUT_DIR = ROOT / "app/src/nd4/screens"
COLOR = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)")
# the accent is one variable (README_design.md §2); its gradient and glow are derived from it there too
ACCENT = "#c2613f"

# What in a screen is data. sub: (regex over the base markup, replacement); ⟦expr⟧ is a JSX expression.
_UNLIT: dict = {}
def _unlit(style: str) -> str:
    """The radius chips' look: the first chip (300 m, unlit in the archive) gives it to all four."""
    return _UNLIT.setdefault("chip", style) if "var(--accent)" not in style else _UNLIT.get("chip", style)


# The ad screens 261..272 (owner 02.11.2026: built behind a flag, not visible to people). Each draws a base screen plus a dashed slot; the
# slot's words are the archive's annotations, so they come in as data (p.ad: id, title, place, size, height; the app gives none with the
# flag off, and a slot with no p.ad draws nothing). Texts, the slot's id and its height are the only parts that differ between the screens.
AD_TYPE = "{ id: string; title: string; place: string; size: string; height: string }"
AD_SUBS = [
    (r'data-ad="[^"]*"', 'data-ad="⟦p.ad.id⟧"'),
    (r'>Ad slot<', '>⟦p.ad.title⟧<'),
    (r'>(?:quiet feed|under Liked|nothing liked|phrase faded|talk ended)<', '>⟦p.ad.place⟧<'),
    (r'>320×(?:100|250)<', '>⟦p.ad.size⟧<'),
    (r'height:(?:100|250)px;', 'height:⟦p.ad.height⟧;'),
]


def ad_splice(base_html: str, ad_html: str, what: str) -> str:
    """The base screen's markup with the block its ad variant adds put in as `⟪ad⟫…⟪/⟫`: one pure insertion against the base or the run stops."""
    a, b = tags(base_html), tags(ad_html)
    n = 0
    while n < len(a) and n < len(b) and a[n] == b[n]:
        n += 1
    m = 0
    while m < len(a) - n and a[len(a) - 1 - m] == b[len(b) - 1 - m]:
        m += 1
    if n + m != len(a) or len(b) <= len(a):
        raise SystemExit(f"{what}: the ad screen is not the base plus one inserted block")
    extra, i1 = "".join(b[n:len(b) - m]), n
    opened = sum(1 for t in b[n:len(b) - m] if t.startswith("<") and not t.startswith("</") and not t.endswith("/>") and not re.match(r"<(br|hr|path|circle|rect|line|polyline|polygon|ellipse)\b", t))
    closed = sum(1 for t in b[n:len(b) - m] if t.startswith("</") and not re.match(r"</(path|circle|rect|line|polyline|polygon|ellipse)\b", t))
    if opened != closed:
        raise SystemExit(f"{what}: the ad block is not balanced: {opened} opened, {closed} closed")
    for rx, rep in AD_SUBS:
        extra, k = re.subn(rx, rep, extra)
        if k != 1:
            raise SystemExit(f"{what}: ad sub {rx} matched {k}")
    return "".join(a[:i1]) + "⟪ad⟫<>" + extra + "</>⟪/⟫" + "".join(a[i1:])


FAMILIES = {
    "place": {
        "base": 22,
        "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
        "props": "{ title: string; backLabel: string; onBack: () => void; q: string; onQ: (e: ChangeEvent<HTMLInputElement>) => void; "
                 "searchText: string; name: string; sub: string; mapText: string; onMap: () => void; "
                 "farText: string; step: number; steps: string[]; onStep: (i: number) => () => void; listShown: boolean; listLabel: string; "
                 "list: ReactNode; note: string; hereText: string; onHere: () => void }",
        "sub": [
            (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
            (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
            (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
            (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="back" class="btn" style="width:48px'),
            (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Your place</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
            (r'<span class="btn" aria-label="How this screen works"', '<span class="btn" aria-hidden="true"'),
            # the archive draws the search as a pill with a word in it: the pill is kept, the word becomes the field's own hint
            (r'<span style="(font:500 [\d.]+px Golos Text);color:#6f685d">Street, area or café</span>',
             r'<input value="⟦p.q⟧" onChange="⟦p.onQ⟧" placeholder="⟦p.searchText⟧" aria-label="⟦p.searchText⟧" autoComplete="off" data-testid="place-search" '
             r'style="flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;\1;color:#2a2926"/>'),
            (r'(<span style="font:600 [\d.]+px/1\.25 Golos Text,serif;color:#fff;")>Molos<', r'\1 data-testid="place-chosen">⟦p.name⟧<'),
            (r'>seafront · Limassol<', '>⟦p.sub⟧<'),
            (r'<div class="rise btn" style="--d:3;', '<div role="button" tabIndex="⟦0⟧" onClick="⟦p.onMap⟧" data-testid="place-map-open" class="rise btn" style="--d:3;'),
            (r'>On the map<', '>⟦p.mapText⟧<'),
            # «Where I am now» is off (owner 02.11): the device is never asked for its place
            (r'<div class="rise btn" style="--d:4;[^>]*>(?:(?!<div)[\s\S])*?Where I am now</span></div>', ''),
            (r'>How far<', '>⟦p.farText⟧<'),
            # the four chips: the archive's 300 m, 1, 3, 10 km are the app's steps 1..4 (step 0 is 100 m, the map's slider only);
            # every chip takes the archive's unlit look (the 300 m chip, first in the row); only [data-on] lights one, by css
            # (place_step_css), so the archive's lit 1 km never stays lit
            (r'<span class="btn" style="(flex:1;height:44px;[^"]*)">(300 m|1 km|3 km|10 km)<',
             lambda m: (lambda i: f'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onStep({i})⟧" aria-pressed="⟦p.step === {i}⟧" '
                                  f'data-on="⟦p.step === {i} ? \'\' : undefined⟧" data-testid="place-step" class="btn" style="{_unlit(m[1])}">⟦p.steps[{i}]⟧<')(
                 ["300 m", "1 km", "3 km", "10 km"].index(m[2]) + 1)),
            (r'(<div style="display:flex;flex-direction:column;gap:8px")>(<span [^>]*>)Recent</span>[\s\S]*?</svg></div>[\s\S]*?</svg></div></div>',
             r'⟪listShown⟫\1 data-testid="place-found">\2⟦p.listLabel⟧</span>⟦p.list⟧</div>⟪/⟫'),
            (r'(<span style="font:500 13px/1\.25 Golos Text,serif;color:#6f685d;)">Only the area is used, never your exact spot\.<br>A place code \(café, square\) — just point your camera at it\.<',
             r'\1white-space:pre-line" data-testid="place-note">⟦p.note⟧<'),
            (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onHere⟧" data-testid="place-here" class="cta rise btn"'),
            (r'</svg>Done</span>', '</svg>⟦p.hereText⟧</span>'),
        ],
    },
    "loading": {
        "base": 14,
        "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
        "props": "{ brand: string; text: string }",
        "sub": [
            (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
            (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
            (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
            (r'<script>[\s\S]*?</script>', ""),
            (r'>sosed<', '>⟦p.brand⟧<'),
            (r'(<[a-z]+ )([^>]*>)Finding your street…<', r'\1role="status" data-testid="loading" \2⟦p.text⟧<'),
        ],
    },
    "update": {
        "base": 15,
        "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
        "props": "{ closeLabel: string; onLater: () => void; title: string; line: string; laterText: string; goText: string; onGo: () => void }",
        "sub": [
            (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
            (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
            (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
            (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onLater⟧" aria-label="⟦p.closeLabel⟧" data-testid="update-close" class="btn" style="width:48px'),
            (r'<span class="btn" aria-label="How this screen works"', '<span class="btn" aria-hidden="true"'),
            (r'<p style="margin:0;font:600 (\d+)px([^"]*)">A new sosed is ready</p>', r'<p role="heading" aria-level="⟦1⟧" id="update-title" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
            (r'(<span style="font:500 \d+px/1\.25 Golos Text,serif;[^"]*?)">v 1\.1 · nearby search and stickers\.<br>Takes a second, nothing is lost\.<',
             r'\1;white-space:pre-line" data-testid="update-line">⟦p.line⟧<'),
            (r'<span class="btn" style="(flex:1;height:\d+px;[^"]*)">Later<', r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onLater⟧" data-testid="update-later" class="btn" style="\1">⟦p.laterText⟧<'),
            (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onGo⟧" data-testid="update-go" class="cta rise btn"'),
            (r'</svg>Update</span>', '</svg>⟦p.goText⟧</span>'),
        ],
    },
    "place-map": {
        "base": 23,
        "optional": {29: "wider"},  # a block only screen 29 has, shown when p.wider is given
        # the same screen drawn for a wider device: the archive's file of that width, its [data-feed] (the screen
        # without the app's rail around it); Place.tsx picks one by the width it is given
        "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
        # the laptop draws the screen as a map plus a «Your place» panel: its own title and lead, no back, no «?»
        "width_sub": {"laptop": [
            (r'<p style="margin:0;font:600 24px([^"]*)">Your place</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 24px\1">⟦p.title⟧</p>'),
            (r'(<span style="font:500 14px/1\.25 Golos Text,serif;color:#6f685d;display:block;line-height:1\.45)">Move the map under the pin\.<br>The circle is how far your feed reaches\.<',
             r'\1;white-space:pre-line" data-testid="place-lead">⟦p.lead⟧<'),
        ]},
        "width_skip": {"laptop": {11, 13, 15}},  # Place title, «?», back: the laptop file has none of them
        "props": "{ map: ReactNode; step: number; steps: string[]; near: string; kind: string; wider?: string; "
                 "radiusLabel: string; onRange: (e: ChangeEvent<HTMLInputElement>) => void; title: string; moveText: string; hereText: string; backLabel: string; "
                 "onBack: () => void; onHere: () => void; lead?: string }",
        "sub": [
            # the sheet's device frame, not the screen: the island, the status bar, the device's corner
            (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
            (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
            (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
            (r'<div class="rise" style="--d:2;padding:14px 14px 30px">',
             '<div class="rise" style="--d:2;position:relative;padding:14px 14px 30px"><input type="range" min="0" max="4" step="1" '
             'value="⟦p.step⟧" onChange="⟦p.onRange⟧" '
             'aria-label="⟦p.radiusLabel⟧" aria-valuetext="⟦p.steps[p.step]⟧" data-testid="place-radius" '
             'style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2"/>'),
            (r'<svg viewBox="0 0 \d+ \d+"[\s\S]*?</svg>', "⟦p.map⟧"),
            (r"left:0;width:50%", "left:0;width:⟦`${p.step * 25}%`⟧"),
            (r"(left:calc\((\d+)% - 4px\);top:-1px;width:8px;height:8px;border-radius:50%;background:)#(?:c2613f|eadfd2)",
             r"\1⟦\2 <= p.step * 25 ? '@c2613f' : '@eadfd2'⟧"),
            (r"left:calc\(50% - 14px\)", "left:⟦`calc(${p.step * 25}% - 14px)`⟧"),
            (r'(<span style="position:absolute;left:(\d+)%;transform:translateX\([^)]*\);font:)(?:500|700)( 12\.5px Golos Text;color:)#(?:6f685d|2a2926)(;white-space:nowrap">)[^<]+',
             r"\1⟦\2 === p.step * 25 ? 700 : 500⟧\3⟦\2 === p.step * 25 ? '@2a2926' : '@6f685d'⟧\4⟦p.steps[\2 / 25]⟧"),
            (r'(<span style="font:600 16px/1\.25 Golos Text,serif;color:#2a2926;")>Near Limassol · 1 km<',
             r'\1 data-testid="place-near" data-kind="⟦p.kind⟧">⟦p.near⟧<'),
            (r">Move the map<", ">⟦p.moveText⟧<"),
            (r'<p style="margin:0;font:600 24px([^"]*)">Place</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 24px\1">⟦p.title⟧</p>'),
            (r"</svg>Here</span>", "</svg>⟦p.hereText⟧</span>"),
            # the help tour is not built yet: the «?» is drawn as the archive has it and hidden from readers
            (r'<span class="btn" aria-label="How this screen works"', '<span class="btn" aria-hidden="true"'),
            (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onHere⟧" data-testid="place-here" class="cta rise btn"'),
            (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="back" class="btn" style="width:48px'),
        ],
        "optional_sub": [(r">Quiet within 1 km — the feed shows 25 km for now\.<", ' data-testid="place-wider">⟦p.wider⟧<')],
    },
}



# The wizard «How it works» 1..4 (screens 17..20): the archive's illustration with its sample phrases, tables and names
# as is; every text goes through p.t (texts mode), the app gives its words per English text (nd4/texts/wizard-N.*.json)
for _k in range(1, 5):
    FAMILIES[f"wizard-{_k}"] = {
        "base": 16 + _k,
        "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
        "texts": True,
        "props": "{ t: Record<string, string>; backLabel: string; onSkip: () => void; onNext: () => void; onBack: () => void }",
        # the first card has no «back» in the archive: its sub 4 matches nothing there
        "width_skip": {w: ({4} if _k == 1 else set()) for w in ("", "tablet", "laptop")},
        "sub": [
            (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
            (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
            (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
            (r'<a href="#" (style="[^"]*")>Skip</a>', r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onSkip⟧" data-testid="intro-close" \1>Skip</span>'),
            (r'<span class="btn" (style="width:58px;height:58px;border-radius:50%;)', r'<span role="button" tabIndex="⟦0⟧" aria-label="⟦p.backLabel⟧" onClick="⟦p.onBack⟧" data-testid="intro-back" class="btn" \1'),
            (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onNext⟧" data-testid="intro-next" class="cta rise btn"'),
            # last: the frame subs and width_skip count by place. Card 3 draws a sample table: its «sit» pill is a picture, nothing to press; a plain sub fails aloud if the archive changes
            *([(r'<span class="btn" (style="height:28px;)', r'<span aria-hidden="true" class="btn" \1')] if _k == 3 else []),
        ],
    }

# Screen 37 `my-phrase`: one's own phrase. What the node has no data for stays behind a prop the app leaves empty (the
# talks count, «Keep 2 h longer»: brief 02.11).
FAMILIES["my-phrase"] = {
    "base": 37,
    "widths": {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"},
    "props": "{ backLabel: string; onBack: () => void; title: string; tag: string; text: string; fs?: string; lang?: string; fadeShown: boolean; fade: string; "
             "fadeText: string; likes: number; likesText: string; talksShown: boolean; talks: number; talksText: string; note: string; refused: boolean; "
             "deleteLabel: string; onDelete?: () => void; onKeep?: () => void; keepText: string }",
    "sub": [
        (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
        (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
        (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
        (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="back" class="btn" style="width:48px'),
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Your phrase</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'<span class="btn" aria-label="How this screen works"', '<span class="btn" aria-hidden="true"'),
        (r'>yours · here<', ' data-testid="my-phrase-tag">⟦p.tag⟧<'),
        (r'(<p style="margin:0;)font:500 30px/1\.22 ([^"]*")>Tavli tonight at the kafeneio\? I bring the board\.<', r'''\1font:500 ⟦p.fs ?? '30px'⟧/1.22 \2 lang="⟦p.lang⟧" data-testid="text">⟦p.text⟧<'''),
        (r'(<div style="margin-top:18px"><span style="display:inline-flex[\s\S]*?)width:55%;([\s\S]*?)>fades in 2 h 20 min</span></span></div>',
         r'⟪fadeShown⟫\1width:⟦p.fade⟧;\2 data-testid="my-phrase-fade">⟦p.fadeText⟧</span></span></div>⟪/⟫'),
        (r'>4</p>', ' data-testid="my-phrase-likes">⟦p.likes⟧</p>'),
        (r'>liked it<', '>⟦p.likesText⟧<'),
        (r'(<div style="border-radius:20px;(?:(?!<div style="border-radius:20px)[\s\S])*?)>2</p>([\s\S]*?)>talks opened</span></div>',
         r'⟪talksShown⟫\1 data-testid="my-phrase-talks">⟦p.talks⟧</p>\2>⟦p.talksText⟧</span></div>⟪/⟫'),
        (r'(<div class="rise" style="--d:3;text-align:center;[^"]*")>You see how many liked, not who — names show in a talk after you like back\.<',
         r'''\1 role="⟦p.refused ? 'alert' : undefined⟧" data-testid="⟦p.refused ? 'takedown-refused' : 'my-phrase-note'⟧">⟦p.note⟧<'''),
        (r'<span aria-label="Delete phrase" class="btn"([^>]*>[\s\S]*?</svg></span>)', r'⟪onDelete⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onDelete⟧" aria-label="⟦p.deleteLabel⟧" data-testid="takedown" class="btn"\1⟪/⟫'),
        (r'(<div style="flex:1;min-width:0;display:flex;flex-direction:column">)<span class="cta rise btn"([\s\S]*?</svg>)Keep 2 h longer</span></div>',
         r'⟪onKeep⟫\1<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onKeep⟧" data-testid="my-phrase-keep" class="cta rise btn"\2⟦p.keepText⟧</span></div>⟪/⟫'),
    ],
}

# The frame every phone screen shares: the island, the status bar, the device's corner (FRAME_SUBS).
_FRAME = [
    (r'<i style="position:absolute;left:50%;top:10px;[^"]*"></i>', ""),
    (r'<div style="position:absolute;top:0;left:0;right:0;height:46px;[^"]*"><span>9:41</span>[\s\S]*?</i></span></div>', ""),
    (r'^(<div class="scr" style="[^"]*?)border-radius:42px;', r"\1"),
]
_BACK = (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="⟦p.backId⟧" class="btn" style="width:48px')
_HELP = (r'<span class="btn" aria-label="How this screen works"', '<span class="btn" aria-hidden="true"')
_WIDTHS = {"tablet": "kypros-tablet.html", "laptop": "kypros-laptop.html"}

# Screen 38 `phrase-rejected`: the moderator's refusal. The node's reason is not shown to a person (depth/web-platform/phrase.ts
# refusalText), «Nothing is counted against you» is left out since a refusal is remembered (feed_verdict.ts refusePhrase); brief 02.11.
FAMILIES["phrase-rejected"] = {
    "base": 38,
    "widths": _WIDTHS,
    "props": "{ backLabel: string; backId: string; onBack: () => void; title: string; text: string; fs?: string; lang?: string; head: string; why: string; "
             "rulesText: string; onRules?: () => void; deleteText: string; onDelete: () => void; editText: string; onEdit: () => void }",
    "sub": [*_FRAME, _BACK, _HELP,
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Your phrase</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'(<p style="margin:0;)font:500 24px/1\.22 ([^"]*")>Selling puppies, DM me for price<', r"""\1font:500 ⟦p.fs ?? '24px'⟧/1.22 \2 lang="⟦p.lang⟧" data-testid="rejected-text">⟦p.text⟧<"""),
        (r'>Not published<', ' data-testid="rejected-head">⟦p.head⟧<'),
        (r'>Selling animals isn’t allowed on sosed\. Nothing is counted against you\.<', ' role="alert" data-testid="refused">⟦p.why⟧<'),
        (r'<div class="rise btn" style="(--d:3;[^"]*)">([\s\S]*?)>Community rules</span></div>(<svg[\s\S]*?</svg>)</div>',
         r'⟪onRules⟫<div role="button" tabIndex="⟦0⟧" onClick="⟦p.onRules⟧" data-testid="rejected-rules" class="rise btn" style="\1">\2>⟦p.rulesText⟧</span></div>\3</div>⟪/⟫'),
        (r'<span class="btn" style="(flex:1;height:\d+px;[^"]*)">(<svg[\s\S]*?</svg>)Delete<', r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onDelete⟧" data-testid="rejected-delete" class="btn" style="\1">\2⟦p.deleteText⟧<'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onEdit⟧" data-testid="rejected-edit" class="cta rise btn"'),
        (r'</svg>Edit</span>', '</svg>⟦p.editText⟧</span>'),
    ],
}

# Screen 39 `phrase-faded` (272 is it with the reserved ad slot, not drawn). «2 talks opened» and «unless you keep them» are not the node's
# data, «Say it again» waits for a way to hand the composer a text: brief 02.11.
FAMILIES["phrase-faded"] = {
    "base": 39,
    "widths": _WIDTHS,
    "optional": {272: "ad"},  # 272: the same screen with a slot between the line and the actions
    "optional_sub": AD_SUBS,
    "props": "{ backLabel: string; backId: string; onBack: () => void; title: string; line: string; againLabel: string; onAgain?: () => void; newText: string; onNew: () => void; ad?: " + AD_TYPE + " }",
    "sub": [*_FRAME, _BACK, _HELP,
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Your phrase faded</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>4 neighbours liked it, 2 talks opened\.<br>Talks fade with it unless you keep them\.<', ' data-testid="faded-line">⟦p.line⟧<'),
        (r'<span aria-label="Say it again" class="btn"([^>]*>[\s\S]*?</svg></span>)', r'⟪onAgain⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onAgain⟧" aria-label="⟦p.againLabel⟧" data-testid="faded-again" class="btn"\1⟪/⟫'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onNew⟧" data-testid="faded-new" class="cta rise btn"'),
        (r'</svg>New phrase</span>', '</svg>⟦p.newText⟧</span>'),
    ],
}

# Screen 110 `offer`: the two of you liked each other. kypros-tablet.html draws it on its own (the phone's drawing in the wide card, no status bar);
# kypros-laptop.html draws only the talks list there, so the 1440 pane keeps the phone's drawing. `who` is the name, the age and the distance
# to their phrase's published centre (talks-logic.ts matchWho; none without a chosen place, owner 06.11). «?» waits for a tour text.
FAMILIES["match-offer"] = {
    "base": 110,
    "widths": {"tablet": "kypros-tablet.html"},
    "props": "{ backLabel: string; onBack: () => void; title: string; who: string; quoteLabel: string; text: string; fadeShown: boolean; fade: string; fadeText: string; "
             "hint: string; error: ReactNode; laterLabel: string; laterPressed: boolean; laterOff: boolean; onLater: () => void; talkText: string; talkOff: boolean; onTalk: () => void }",
    "sub": [*_FRAME,
        (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="match-back" class="btn" style="width:48px'),
        _HELP,
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">You both liked</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>Eleni, 34 · 350 m<', '>⟦p.who⟧<'),
        (r'>her phrase<', '>⟦p.quoteLabel⟧<'),
        (r'>Anyone up for a swim at Dasoudi tomorrow at 7\?<', ' data-testid="match-text">⟦p.text⟧<'),
        (r'(<div style="margin-top:14px"><span style="display:inline-flex[\s\S]*?)width:70%;([\s\S]*?)>fades in 3 h</span></span></div>',
         r'⟪fadeShown⟫\1width:⟦p.fade⟧;\2 data-testid="match-fade">⟦p.fadeText⟧</span></span></div>⟪/⟫'),
        (r'>The talk lasts as long as the phrase\.</div>', ' data-testid="match-hint">⟦p.hint⟧</div>⟦p.error⟧'),
        (r'<span aria-label="Later" class="btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onLater⟧" aria-label="⟦p.laterLabel⟧" aria-pressed="⟦p.laterPressed⟧" aria-disabled="⟦p.laterOff⟧" data-testid="not-now" class="btn"'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onTalk⟧" aria-disabled="⟦p.talkOff⟧" data-testid="talk" class="cta rise btn"'),
        (r'</svg>Say hi</span>', '</svg>⟦p.talkText⟧</span>'),
    ],
}

# Screen 111 `offer-waiting`: I said yes, the other has not. The quick chips fill the field (owner 06.11); «…» opens the card's sheet while their phrase has an id;
# the sample bubble is the queue, the drawn field holds a real input. Widths as match-offer: its own at 834, the phone's in the 1440 pane.
FAMILIES["match-waiting"] = {
    "base": 111,
    "widths": {"tablet": "kypros-tablet.html"},
    "props": "{ backLabel: string; backId: string; onBack: () => void; who: string; far: string; fadeShown: boolean; fade: string; fadeText: string; title: string; note: string; "
             "chipLabel: Record<'wave' | 'good' | 'thanks' | 'coffee' | 'play', string>; onChip: Record<'wave' | 'good' | 'thanks' | 'coffee' | 'play', () => void>; moreLabel: string; onMore?: () => void; queue: ReactNode; input: ReactNode; sendLabel: string; sendOff: boolean; onSend: () => void }",
    "sub": [*_FRAME,
        # «…» opens the feed card's sheet over their phrase (hide, report); drawn only while the phrase has an id (owner /go 06.11)
        (r'>\?</span><span class="btn" style="width:48px([^>]*)>(<svg[\s\S]*?</svg>)</span>',
         r'>?</span>⟪onMore⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onMore⟧" aria-label="⟦p.moreLabel⟧" data-testid="waiting-more" class="btn" style="width:48px\1>\2</span>⟪/⟫'),
        _BACK, _HELP,
        (r'>Eleni, 34<', '>⟦p.who⟧<'),
        # the distance to their phrase's published place (owner /go 06.11; talks-logic.ts matchWho); empty without a place
        (r'(<span style="[^"]*")>350 m</span>', r'\1 data-testid="waiting-far">⟦p.far⟧</span>'),
        (r'(<span style="display:inline-flex[^"]*"><i style="width:50px[\s\S]*?)width:30%;([\s\S]*?)>fades in 3 h</span></span>',
         r'⟪fadeShown⟫\1width:⟦p.fade⟧;\2 data-testid="waiting-fade">⟦p.fadeText⟧</span></span>⟪/⟫'),
        (r'<div style="flex:1;display:flex;flex-direction:column;align-items:center', '<div data-testid="waiting" style="flex:1;display:flex;flex-direction:column;align-items:center'),
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Waiting for Eleni</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>She’ll see your message next time<br>she opens sosed\.<', '>⟦p.note⟧<'),
        (r'<div class="rise" style="--d:2;[^"]*">Hi! Is the 7 am swim still on\?</div>', '⟦p.queue⟧'),
        # the five quick chips put ready words into the field, the person sends (owner questionnaire 06.11)
        (r'<span class="btn" aria-label="Wave"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onChip.wave⟧" aria-label="⟦p.chipLabel.wave⟧" data-testid="waiting-chip-wave" class="btn"'),
        (r'<span class="btn" aria-label="Good"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onChip.good⟧" aria-label="⟦p.chipLabel.good⟧" data-testid="waiting-chip-good" class="btn"'),
        (r'<span class="btn" aria-label="Thanks"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onChip.thanks⟧" aria-label="⟦p.chipLabel.thanks⟧" data-testid="waiting-chip-thanks" class="btn"'),
        (r'<span class="btn" aria-label="Coffee\?"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onChip.coffee⟧" aria-label="⟦p.chipLabel.coffee⟧" data-testid="waiting-chip-coffee" class="btn"'),
        (r'<span class="btn" aria-label="Play"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onChip.play⟧" aria-label="⟦p.chipLabel.play⟧" data-testid="waiting-chip-play" class="btn"'),
        (r'>Message</span>', '>⟦p.input⟧</span>'),
        (r'<span class="btn" aria-label="Send"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onSend⟧" aria-label="⟦p.sendLabel⟧" aria-disabled="⟦p.sendOff⟧" data-testid="enqueue" class="btn"'),
    ],
}

# Screen 45 (112 `offer-gone` draws the same): the other said «not now» to my yes.
FAMILIES["match-gone"] = {
    "base": 45,
    "props": "{ backLabel: string; backId: string; onBack: () => void; title: string; line: string; goText: string; onGo: () => void }",
    "sub": [*_FRAME, _BACK, _HELP,
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">This phrase has faded</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>Phrases live a few hours\.<br>See what’s around you now\.<', ' data-testid="tombstone">⟦p.line⟧<'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onGo⟧" data-testid="to-inbox" class="cta rise btn"'),
        (r'</svg>See phrases nearby</span>', '</svg>⟦p.goText⟧</span>'),
    ],
}

# Screen 63 `offer-exit`, a member of the family's drawing: the link stays a real link to the node's redirect. «Nobody on sosed sees…» is
# not said (not verified); the line under the domain is the app's, the note holds only the report's answer.
FAMILIES["offer-exit"] = {
    "base": 63,
    "widths": _WIDTHS,
    "props": "{ backLabel: string; backId: string; onBack: () => void; title: string; opening: string; domain: string; line: string; disabled: boolean; note?: string; noteId?: string; noteRole?: string; "
             "reportLabel: string; onReport?: () => void; goHref?: string; goText: string }",
    "sub": [*_FRAME, _BACK, _HELP,
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">Leaving sosed</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>You’re opening kalinda\.cy\.<br>sosed doesn’t check other sites\.<', ' data-testid="exit" data-disabled="⟦p.disabled⟧">⟦p.opening⟧ <b data-testid="domain">⟦p.domain⟧</b><br>⟦p.line⟧<'),
        (r'(<div class="rise" style="--d:4;text-align:center;[^"]*")>Nobody on sosed sees that you opened it\.</div>', r'⟪note⟫\1 role="⟦p.noteRole⟧" data-testid="⟦p.noteId⟧">⟦p.note⟧</div>⟪/⟫'),
        (r'<span aria-label="Report link" class="btn"([^>]*>[\s\S]*?</svg></span>)', r'⟪onReport⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onReport⟧" aria-label="⟦p.reportLabel⟧" data-testid="report" class="btn"\1⟪/⟫'),
        (r'<span class="cta rise btn" style="([^"]*)">([\s\S]*?</svg>)Open kalinda\.cy</span>', r'⟪goHref⟫<a href="⟦p.goHref⟧" rel="nofollow noopener noreferrer" data-testid="go" class="cta rise btn" style="text-decoration:none;\1">\2⟦p.goText⟧</a>⟪/⟫'),
    ],
}

TEXTS: dict[str, set] = {}  # family -> the archive's texts put through p.t, over every width


def text_slots(fam_name: str, html: str) -> str:
    """Texts mode: every text left between tags becomes p.t["<the archive's English>"]; collected for nd4/texts."""
    import html as H
    got = TEXTS.setdefault(fam_name, set())

    def one(m):
        raw = m[1]
        key = H.unescape(raw.strip())
        got.add(key)
        lead, tail = raw[:len(raw) - len(raw.lstrip())], raw[len(raw.rstrip()):]
        return ">" + lead + "⟦p.t[" + json.dumps(key, ensure_ascii=False) + "]⟧" + tail + "<"
    return re.sub(r">([^<⟦⟧⟪⟫]*[^\s<⟦⟧⟪⟫][^<⟦⟧⟪⟫]*)<", one, html)

def blocks(name: str) -> list[str]:
    s = (SCREENS / name).read_text(encoding="utf-8")
    st = [m.start() for m in re.finditer(r'<div class="scr"', s)] + [len(s)]
    out = []
    for a, b in zip(st, st[1:]):
        seg = s[a:b]
        k = seg.rfind('<div class="item">')
        seg = seg[:k] if k > 0 else seg
        seg = re.sub(r"</body>\s*</html>\s*$", "", seg)  # the last screen runs to the file's own end
        # the cut also takes the sheet's closers of .dev and .item: drop the </div> the screen did not open
        extra = len(re.findall(r"</div>", seg)) - len(re.findall(r"<div[\s>]", seg))
        while extra > 0 and seg.rstrip().endswith("</div>"):
            seg = seg.rstrip()[:-6]
            extra -= 1
        out.append(seg)
    return out


def norm(c: str) -> str:
    c = c.lower().replace(" ", "")
    if re.fullmatch(r"#[0-9a-f]{3}", c):
        c = "#" + "".join(ch * 2 for ch in c[1:])
    return c


def tags(html: str) -> list[str]:
    return re.findall(r"<[^>]+>|[^<]+", html)


def theme_files(device: str = "phone") -> dict[tuple[str, str], str]:
    return {(t, tm): f"{st}{'-night' if tm == 'night' else ''}-{device}.html" for st, t in THEMES.items() for tm in ("day", "night")}


DATA_URL = r"url\('data:[^']*'\)"
ALL_DEVICES = ("phone", "tablet", "laptop")
MISS = "\0missing"  # the theme's file has no such tag at this place


def tag_decls(t: str) -> dict[str, str]:
    """A tag's declarations: its style, plus the fill and stroke attributes that hold a color. A data url reads as none."""
    t = re.sub(DATA_URL, "none", t).replace("var(--kit-grain)", "none")
    out = {}
    m = re.search(r'\sstyle="([^"]*)"', t)
    for decl in re.split(r";(?![^(]*\))", m[1]) if m else []:
        if ":" in decl:
            k, v = decl.split(":", 1)
            out[k.strip()] = v.strip()
    for attr in SVG_COLOR_ATTR:
        m = re.search(rf'\s{attr}="([^"]*)"', t)
        if m and COLOR.search(m[1]):
            out[attr] = m[1]
    return out


def tag_skeleton(t: str) -> str:
    """What must match for two tags to be the same place: not the style or the paint, which a theme may redraw."""
    if not t.startswith("<"):
        return t
    return COLOR.sub("C", re.sub(r'\s(?:style|fill|stroke)="[^"]*"', "", re.sub(DATA_URL, "", t)))


def _key_full(t: str) -> str:
    return re.sub(DATA_URL, "none", t).replace("var(--kit-grain)", "none")


def _key_style(t: str) -> tuple:
    m = re.match(r"<([\w-]+)", t)
    return (m[1] if m else "", tuple(sorted(tag_decls(t).items())))


_walked: dict = {}


def walk_places(nums: list[int], device: str) -> list[tuple[int, str, dict]]:
    """Each open tag of the kypros file's screens: (screen, tag, theme -> that tag's declarations in the theme's file, None when absent)."""
    key = (tuple(nums), device)
    if key in _walked:
        return _walked[key]
    files = theme_files(device)
    base = blocks(f"kypros-{device}.html")
    places: dict[tuple[int, int], tuple[int, str, dict]] = {}
    for theme, f in files.items():
        other = blocks(f)
        for n in nums:
            a, b = tags(base[n - 1]), tags(other[n - 1])
            for i, t in enumerate(a):
                if t.startswith("<") and not t.startswith("</"):
                    places.setdefault((n, i), (n, t, {}))[2][theme] = None
            sm = difflib.SequenceMatcher(None, [tag_skeleton(x) for x in a], [tag_skeleton(x) for x in b], autojunk=False)
            for op, i1, i2, j1, j2 in sm.get_opcodes():
                if op == "equal":
                    for k in range(i2 - i1):
                        if (n, i1 + k) in places:
                            places[(n, i1 + k)][2][theme] = tag_decls(b[j1 + k])
    _walked[key] = [places[k] for k in sorted(places)]
    return _walked[key]


def color_table(nums: list[int], device: str = "phone") -> dict[str, dict[tuple[str, str], str]]:
    """base color -> (theme, time) -> its value there: the most frequent over the places, always all 8 themes.
    A declaration a theme draws with other stops gives no pair here (the place's own token holds it whole, panel 02.11);
    a color with no pair in a theme takes the color at its position there, then its own value, so no token is left undefined."""
    themes = list(theme_files(device))
    table: dict[str, dict[tuple[str, str], list[str]]] = {}
    loose: dict[str, dict[tuple[str, str], list[str]]] = {}
    for _, t, per in walk_places(nums, device):
        for prop, val in tag_decls(t).items():
            ca = [norm(c) for c in COLOR.findall(val)]
            for theme in themes:
                other = (per.get(theme) or {}).get(prop)
                cb = [norm(c) for c in COLOR.findall(other)] if other else []
                same = other is not None and COLOR.sub("C", other) == COLOR.sub("C", val)
                for i, u in enumerate(ca):
                    table.setdefault(u, {})
                    if same:
                        table[u].setdefault(theme, []).append(cb[i])
                    elif cb:
                        loose.setdefault(u, {}).setdefault(theme, []).append(cb[min(i, len(cb) - 1)])
    # the most frequent value; a tie goes to the one met first, in screen order (a set's order changed run to run:
    # --check failed on #f0d9cd once the wizard's screens came in)
    top = lambda v: max(dict.fromkeys(v), key=v.count)
    return {c: {k: top(per[k]) if k in per else top(loose[c][k]) if k in loose.get(c, {}) else c for k in themes} for c, per in table.items()}


class Names(dict):
    """base color -> its token, as before; on top of it the place's own value per theme (panel 02.11: one color of the
    base file is several colors of a theme's file). Asked by tag, then by tag name and style, then by property and value."""

    def __init__(self, base: dict[str, str], table, known, device_nums):
        super().__init__(base)
        self.table, self.known = table, known
        self.extra: dict[str, dict[tuple[str, str], str]] = {}
        self.minority: list[str] = []  # places whose archive color no key can tell from the winner's
        self.missing: list[str] = []  # places a theme's file does not draw
        self.themes = list(theme_files())
        full: dict = {}
        style: dict = {}
        pv: dict = {}
        self.absent: dict = {}
        self.absent_style: dict = {}
        accents: dict = {}
        rows = []
        for device, nums in device_nums:
            for n, t, per in walk_places(nums, device):
                base_d = tag_decls(t)
                for prop in sorted(set(base_d) | {p for d in per.values() if d for p in d}):
                    vals = tuple(MISS if th not in per or per[th] is None else per[th].get(prop) for th in self.themes)
                    b = base_d.get(prop)
                    if not (prop.endswith("backdrop-filter") or (b and COLOR.search(b)) or any(v and v != MISS and COLOR.search(v) for v in vals)):
                        continue
                    rows.append((device, n, t, prop, b, vals))
                    full.setdefault((_key_full(t), prop), {}).setdefault(vals, []).append((device, n))
                    style.setdefault((_key_style(t), prop), {}).setdefault(vals, []).append((device, n))
                    if b:
                        pv.setdefault((prop, b), {}).setdefault(vals, []).append((device, n))
                    if b and norm(b) == norm(ACCENT):
                        for th, v in zip(self.themes, vals):
                            if v and v != MISS:
                                accents.setdefault(th, []).append(norm(v))
        self.accent = {th: max(dict.fromkeys(v), key=v.count) for th, v in accents.items()}
        win = lambda groups: max(groups, key=lambda vals: (MISS not in vals, len(groups[vals])))
        self.pv = {k: win(g) for k, g in pv.items()}
        self.full = {k: win(g) for k, g in full.items()}
        self.style = {k: win(g) for k, g in style.items()}
        # absent in the base, drawn by a theme: a declaration the tag must gain
        for k, g in full.items():
            if not any(p == k[1] for p in tag_decls(k[0])):
                self.absent.setdefault(k[0], {})[k[1]] = win(g)
        for k, g in style.items():
            if k[1] not in dict(k[0][1]):
                self.absent_style.setdefault(k[0], {})[k[1]] = win(g)
        for (t, prop), g in sorted(full.items()):
            w = win(g)
            for vals, where in g.items():
                if vals != w and MISS not in vals:
                    self.minority.append(f"{prop} x{len(where)} screens {sorted({n for _, n in where})}: {t[:90]}")
            if any(MISS in vals for vals in g):
                self.missing.append(f"{prop} screens {sorted({n for vs, w_ in g.items() if MISS in vs for _, n in w_})}: {t[:90]}")
        # the default per-theme values of a color: its most frequent tuple over the places
        tups: dict = {}
        for _, _, _, prop, b, vals in rows:
            if b and MISS not in vals and None not in vals and all(COLOR.sub("C", v) == COLOR.sub("C", b) for v in vals):
                for i, c in enumerate(COLOR.findall(b)):
                    tups.setdefault(norm(c), {}).setdefault(tuple(norm(COLOR.findall(v)[i]) for v in vals), []).append(1)
        self.default = {c: max(g, key=lambda k: len(g[k])) for c, g in tups.items()}
        for c, d in self.default.items():
            self.table[c] = dict(zip(self.themes, d))
        for c, var in token_names(self.table, known).items():
            self[c] = var

    def _fill(self, prop, b, vals):
        """A theme's file with no such tag: the value this property and value have elsewhere in it, else the base's."""
        if MISS not in vals:
            return vals
        other = self.pv.get((prop, b)) if b else None
        return tuple((other[i] if other and other[i] != MISS else b) if v == MISS else v for i, v in enumerate(vals))

    def _color_var(self, c: str, tup: tuple) -> str:
        if c == norm(ACCENT):
            return "var(--accent)"
        if len(set(tup)) == 1:
            return tup[0]
        if self.default.get(c) == tup or c not in self.default:
            self.table.setdefault(c, dict(zip(self.themes, tup)))
            return self.get(c, c) if str(self.get(c, c)).startswith("var(") else self._variant(c, tup)
        return self._variant(c, tup)

    def _variant(self, c: str, tup: tuple) -> str:
        name = "--kit-" + re.sub(r"[^0-9a-f]+", "-", c.strip("#").replace("rgba(", "a").replace("rgb(", "")).strip("-") + "-" + _digest(tup)
        self.extra[name] = dict(zip(self.themes, tup))
        return f"var({name}, {c})"

    def _whole(self, prop: str, vals: tuple) -> str:
        out = []
        for th, v in zip(self.themes, vals):
            if v is None:
                out.append("initial")  # the theme does not set it: the token is invalid there, the property unset
                continue
            a = self.accent.get(th)
            v = css_value(v.replace("'", '"'))
            out.append(re.sub(re.escape(a) + r"(?![0-9a-f])", "var(--accent)", v) if a else v)
        name = "--kit-d-" + _digest(tuple(out))
        self.extra[name] = dict(zip(self.themes, out))
        return f"var({name})"

    def _value(self, prop: str, b, vals: tuple) -> str:
        vals = self._fill(prop, b, vals)
        if b and len(set(vals)) == 1 and vals[0] == b:
            return b
        if b and None not in vals and all(COLOR.sub("C", v) == COLOR.sub("C", b) for v in vals):
            cols = [[norm(c) for c in COLOR.findall(v)] for v in vals]
            it = iter(range(len(cols[0])))
            return COLOR.sub(lambda m: (lambda i: self._color_var(norm(m[0]), tuple(c[i] for c in cols)))(next(it)), b)
        return self._whole(prop, vals)

    def resolve(self, t: str, prop: str, v: str) -> str:
        """The css value of declaration prop:v of tag t, each theme showing the archive's own color of this place."""
        if "⟦" in v:
            return colorize(v, self)
        b = _key_full(v) if "data:" in v else v
        for vals in (self.full.get((_key_full(t), prop)), self.style.get((_key_style(t), prop)), self.pv.get((prop, b))):
            if vals is not None:
                return self._value(prop, b, vals)
        return colorize(v, self)

    def gained(self, t: str) -> list[tuple[str, str]]:
        """Declarations of this place that the base file does not write and some theme does (a glass panel's blur)."""
        got = self.absent.get(_key_full(t)) or self.absent_style.get(_key_style(t)) or {}
        return [(p, self._whole(p, self._fill(p, None, vals))) for p, vals in sorted(got.items())]


def _digest(parts) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:6]


def known_tokens() -> dict[tuple[str, str], dict[str, str]]:
    css = TOKENS.read_text()
    out = {}
    for m in re.finditer(r':root\[data-theme="(\w+)"\]\[data-time="(\w+)"\]\s*\{([^}]*)\}', css):
        out[(m[1], m[2])] = {k: norm(v.strip()) for k, v in re.findall(r"(--[\w-]+):\s*([^;]+);", m[3])}
    return out


def token_names(table, known) -> dict[str, str]:
    names = {norm(ACCENT): "var(--accent)"}
    for c, per in table.items():
        if c in names:
            continue
        if len(set(per.values())) == 1 and len(per) == 8:
            continue  # the same in every theme: stays a literal
        hit = [t for t, v in known.get(("limestone", "day"), {}).items() if v == c
               and all(known.get(k, {}).get(t) == pv for k, pv in per.items())]
        names[c] = f"var({hit[0]})" if hit else f"var(--kit-{re.sub(r'[^0-9a-f]+', '-', c.strip('#').replace('rgba(', 'a').replace('rgb(', '')).strip('-')}, {c})"
    return names


def kebab_to_camel(s: str) -> str:
    if s.startswith("--"):
        return s
    s = re.sub(r"^-webkit-", "Webkit-", s)
    return re.sub(r"-([a-z])", lambda m: m[1].upper(), s)


def colorize(v: str, names: dict[str, str]) -> str:
    slots = re.split(r"('@[0-9a-f]{6}')", v)  # an @hex slot is a color named by FAMILIES; colored once, not twice
    return "".join("'" + names.get("#" + t[2:-1], "#" + t[2:-1]) + "'" if i % 2 else
                   COLOR.sub(lambda m: names.get(norm(m[0]), m[0]), t) for i, t in enumerate(slots))


def js_str(v: str) -> str:
    if "⟦" not in v:
        # archive text becomes a JS string: json.dumps escapes quotes and backslashes (panel 31.10, security 1)
        return repr(v).replace("\\'", "'") if "'" not in v else json.dumps(v, ensure_ascii=False)
    parts = re.split(r"⟦(.*?)⟧", v)
    if len(parts) == 3 and not parts[0] and not parts[2]:
        return parts[1]
    return "`" + "".join(p.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${") if i % 2 == 0 else "${" + p + "}" for i, p in enumerate(parts)) + "`"


def style_obj(s: str, names, tag: str = "") -> str:
    props: dict[str, str] = {}  # a property set twice in the archive: the later one wins, as in css
    for decl in re.split(r";(?![^(]*\))(?![^⟦]*⟧)", s):
        if ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        key = kebab_to_camel(k.strip())
        props.pop(key, None)
        props[key] = js_str(names.resolve(tag, k.strip(), v.strip()) if isinstance(names, Names) and tag else colorize(v.strip(), names))
    if isinstance(names, Names) and tag:
        for k, v in names.gained(tag):
            props.setdefault(kebab_to_camel(k), js_str(v))
    return "{{ " + ", ".join(f'"{k}": {v}' for k, v in props.items()) + " } as CSSProperties}"


SVG_COLOR_ATTR = {"fill", "stroke"}


def tag_to_jsx(t: str, names) -> str:
    if not t.startswith("<"):
        parts = re.split(r"⟦(.*?)⟧", t)
        return "".join(p.replace("{", "{'{'}").replace("}", "{'}'}") if i % 2 == 0 else "{" + p + "}" for i, p in enumerate(parts))
    if t.startswith("</"):
        return t
    m = re.match(r"<([\w-]+)", t)
    name, rest = m[1], t[m.end():]
    selfclose = rest.rstrip().endswith("/>")
    attrs, style_extra = [], []
    # a bare data-* attribute (the laptop's `.wideapp data-form`, which the kit's css selects) keeps itself as ""
    for am in re.finditer(r'([\w:-]+)(?:="([^"]*)")?', rest):
        k, v = am[1], am[2]
        if v is None:
            if not k.startswith("data-"):
                continue
            v = ""
        if k == "style":
            continue
        if k == "class":
            attrs.append(f'className="{v}"')
            continue
        if k in SVG_COLOR_ATTR and COLOR.search(v) and (names.resolve(t, k, v) != v if isinstance(names, Names) else names.get(norm(v), "").startswith("var(")):
            style_extra.append(f"{k}:{v}")
            continue
        jk = k if k.startswith(("aria-", "data-")) or k in ("viewBox", "tabIndex", "onClick") else kebab_to_camel(k)
        if "⟦" in v:
            attrs.append(f"{jk}={{{js_str(v)}}}")
        else:
            attrs.append(f'{jk}="{v}"')
    sm = re.search(r'\sstyle="([^"]*)"', rest)
    style = ";".join(filter(None, [sm[1] if sm else "", *style_extra]))
    whole = re.fullmatch(r"⟦([^⟧]*)⟧", style)
    if whole:  # a slot that is the whole style attribute: an expression, not a "prop: value" list
        attrs.append("style={" + whole[1] + "}")
    elif style or (isinstance(names, Names) and names.gained(t)):
        attrs.append("style=" + style_obj(style, names, t))
    if name in ("span", "div") and any(a.startswith("onClick=") for a in attrs):
        attrs.append("onKeyDown={(e: KeyboardEvent<HTMLElement>) => { if (e.key === \"Enter\" || e.key === \" \") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}")
    return f"<{name} " + " ".join(attrs) + (" />" if selfclose else ">") if attrs else f"<{name}{' /' if selfclose else ''}>"


def optional_block(base_html: str, other_html: str, n: int) -> tuple[int, str]:
    """The block screen n adds to the base: (tag index in the base where it goes, its markup)."""
    a, b = tags(base_html), tags(other_html)
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "insert":
            return i1, "".join(b[j1:j2])
    raise SystemExit(f"screen {n}: no inserted block against the base")


FRAME_SUBS = 3  # the first subs of a family remove the phone's frame; a wider file's [data-feed] has none


def feed(block: str) -> str:
    """The screen of a wider file: its .scr tag at full size, around the [data-feed] subtree, without the app's rail."""
    # a feed-like screen marks its subtree [data-feed]; a form screen (22 «Your place») has none: its panel is the
    # <div> right after the app's <nav>, holding the .wideapp column
    # a screen with no rail at all (14 loading: the person is not in yet) is taken whole, frame at full size
    if "<div data-feed" not in block and "</nav>" not in block:
        # only the .scr element: a wider file draws the device around it (the laptop's base) after it closes
        j = block.index('<div class="scr"')
        d = 0
        for m in re.finditer(r"<(/?)div\b", block[j:]):
            d += -1 if m[1] else 1
            if d == 0:
                return re.sub(r"width:\d+px;height:\d+px", "width:100%;height:100%", block[j:j + m.start() + 6], count=1)
        raise SystemExit(".scr is not closed")
    i = block.index("<div data-feed") if "<div data-feed" in block else block.index("<div", block.index("</nav>"))
    d = 0
    for m in re.finditer(r"<(/?)div\b", block[i:]):
        d += -1 if m[1] else 1
        if d == 0:
            scr = re.sub(r"width:\d+px;height:\d+px", "width:100%;height:100%", tags(block)[0], count=1)
            return scr + block[i:i + m.start() + 6] + "</div>"
    raise SystemExit("[data-feed] is not closed")


def screen(src: str, n: int) -> str:
    b = blocks(src)[n - 1]
    return b if src == BASE_FILE else feed(b)


def render(fam_name: str, fam: dict, names, src: str = BASE_FILE, suffix: str = "") -> str:
    html = screen(src, fam["base"])
    # ⟦⟧ and ⟪⟫ mark code put in by FAMILIES; the same characters in the archive would turn its text into code (panel 31.10)
    for n in [fam["base"], *fam.get("optional", {})]:
        if re.search("[⟦⟧⟪⟫]", blocks(src)[n - 1]):
            raise SystemExit(f"{fam_name}: screen {n} of the archive holds a slot marker ⟦⟧⟪⟫; refusing to make it code")
    # the screen's background differs per theme as a whole (gradients, the paper grain or none): one token, its
    # value taken whole from each theme's file (scr_backgrounds)
    html = re.sub(r'^(<div class="scr" style="[^"]*?background:)[^"]*"', r'\1var(--kit-scr-bg)"', html)
    html = re.sub(r"url\('data:[^']*'\)", "none", html)
    opt = {}
    for n, flag in fam.get("optional", {}).items():
        at, extra = optional_block(screen(src, fam["base"]), screen(src, n), n)
        for rx, rep in fam.get("optional_sub", []):
            extra, k = re.subn(rx, rep, extra)
            if not k:
                raise SystemExit(f"{fam_name}: optional sub matched nothing: {rx}")
        opt[at] = (flag, re.sub(r"url\('data:[^']*'\)", "var(--kit-grain)", extra))
    parts = tags(html)
    pieces = []
    for i, t in enumerate(parts):
        if i in opt:
            flag, extra = opt[i]
            pieces.append(f"⟪{flag}⟫{extra}⟪/⟫")
        pieces.append(t)
    html = "".join(pieces)
    skip = fam.get("width_skip", {}).get(suffix, set())
    for i, (rx, rep) in enumerate(fam.get("width_sub", {}).get(suffix, [])):
        html, k = re.subn(rx, rep, html)
        if not k:
            raise SystemExit(f"{fam_name} {suffix}: width sub matched nothing: {rx}")
    for i, (rx, rep) in enumerate(fam["sub"]):
        html, k = re.subn(rx, rep, html)
        if not k and not (src != BASE_FILE and i < FRAME_SUBS) and i not in skip:
            raise SystemExit(f"{fam_name}: sub matched nothing: {rx}")
    if fam.get("texts"):
        html = text_slots(fam_name, html)
    out = to_jsx(html, names)
    comp = "".join(w.capitalize() for w in fam_name.split("-")) + "Screen" + suffix.capitalize()
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen {fam['base']} "
            f"(family {fam_name}: {', '.join(map(str, [fam['base'], *fam.get('optional', {})]))}) by "
            f"scripts/design/nd4-extract.py; do not edit\n"
            "import type { ChangeEvent, CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"export function {comp}(p: {fam['props']}) {{\n  return (\n    {out}\n  );\n}}\n")


def to_jsx(html: str, names) -> str:
    if re.search(r"⟦[^⟧]*>", html):
        raise SystemExit("a slot holds '>': the tag would be cut there")
    html = re.sub(r"<(br|hr)>", r"<\1/>", html)  # void elements: JSX wants them closed
    out = []
    for t in re.findall(r"⟪[^⟫]*⟫|<>|<[^>]+>|[^<⟪]+", html):
        if t == "<>":
            out.append(t)
        elif t.startswith("⟪/"):
            out.append(")}")
        elif t.startswith("⟪"):
            out.append("{p." + t[1:-1] + " && (")
        else:
            out.append(tag_to_jsx(t, names))
    return "".join(out)


# The laptop's nav (250 of the 260 app screens at 1440 draw it the same; 9 are the advertiser's): the archive's <nav> of
# screen 23, the tab drawn current takes the archive's current look (Nearby there), the others the archive's idle one.
NAV_SRC, NAV_SCREEN = "kypros-laptop.html", 23
NAV_TABS = {"Nearby": "feed", "Tables": "tables", "Talks": "chats", "Me": "me"}


def render_nav(names) -> str:
    b = blocks(NAV_SRC)[NAV_SCREEN - 1]
    if re.search("[⟦⟧⟪⟫]", b):
        raise SystemExit("nav: the archive holds a slot marker ⟦⟧⟪⟫; refusing to make it code")
    nav = re.search(r"<nav[\s\S]*?</nav>", b)[0]
    nav = nav.replace("<nav ", '<nav aria-label="⟦p.label⟧" data-testid="nav-laptop" ', 1)
    nav, k = re.subn(r'<span class="btn kcta" style="', '<span role="button" tabIndex="⟦0⟧" onClick="⟦go(\'say\')⟧" data-testid="rail-say" class="btn kcta" style="', nav)
    nav, k2 = re.subn(r"</svg>New phrase</span>", "</svg>⟦p.sayText⟧</span>", nav)
    for word, tab in NAV_TABS.items():
        cur = f"p.active === '{tab}'"
        rx = (r'<span class="btn" style="(display:flex;align-items:center;gap:14px;height:50px;padding:0 14px;border-radius:16px;font:600 15px Golos Text;)'
              r'color:#(?:c2613f|2a2926);(?:background:#f0d9cd)?"><svg ([^>]*?)stroke="#[0-9a-f]+"([^>]*?)style="([^"]*?)color:#[0-9a-f]+;([^"]*)"([\s\S]*?)</svg>' + word + "</span>")
        to = (f'<span role="button" tabIndex="⟦0⟧" onClick="⟦go(\'{tab}\')⟧" aria-current="⟦{cur} ? \'page\' : undefined⟧" '
              f'data-testid="tab-{tab}" class="btn" style="\\1color:⟦{cur} ? \'@c2613f\' : \'@2a2926\'⟧;background:⟦{cur} ? \'@f0d9cd\' : \'transparent\'⟧">'
              f'<svg \\2stroke="currentColor"\\3style="\\4color:⟦{cur} ? \'@c2613f\' : \'@8d877d\'⟧;\\5"\\6</svg>⟦p.labels.{tab}⟧</span>')
        nav, n = re.subn(rx, to, nav)
        if n != 1:
            raise SystemExit(f"nav: tab {word} matched {n} times")
    if not (k == 1 and k2 == 1):
        raise SystemExit("nav: «New phrase» not found")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{NAV_SRC} screen {NAV_SCREEN} (the <nav>) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            "export type NavTab = \"feed\" | \"tables\" | \"chats\" | \"me\" | \"say\";\n\n"
            "export function NavLaptop(p: { active: NavTab; onSelect: (tab: NavTab) => void; label: string; sayText: string; "
            "labels: Record<\"feed\" | \"tables\" | \"chats\" | \"me\", string> }) {\n"
            "  const go = (tab: NavTab) => () => p.onSelect(tab);  // no arrow in a slot: its > would end the tag\n"
            f"  return (\n    {to_jsx(nav, names)}\n  );\n}}\n")


# The tablet's nav (260 of the 283 screens at 820 draw it): the archive's <nav> of kypros-tablet.html screen 23, an
# 80 px rail of icon buttons; the words are the buttons' aria-labels. Shown beside the screens drawn from the archive.
NAV_TABLET_SRC = "kypros-tablet.html"


def render_nav_tablet(names) -> str:
    b = blocks(NAV_TABLET_SRC)[NAV_SCREEN - 1]
    if re.search("[⟦⟧⟪⟫]", b):
        raise SystemExit("nav tablet: the archive holds a slot marker ⟦⟧⟪⟫; refusing to make it code")
    nav = re.search(r"<nav[\s\S]*?</nav>", b)[0]
    nav = nav.replace("<nav ", '<nav aria-label="⟦p.label⟧" data-testid="nav-tablet" ', 1)
    nav, k = re.subn(r'<span class="btn kcta" aria-label="New phrase" style="',
                     '<span role="button" tabIndex="⟦0⟧" onClick="⟦go(\'say\')⟧" data-testid="rail-say" class="btn kcta" aria-label="⟦p.sayText⟧" style="', nav)
    if k != 1:
        raise SystemExit("nav tablet: «New phrase» not found")
    for word, tab in NAV_TABS.items():
        cur = f"p.active === '{tab}'"
        rx = (r'<span class="btn" aria-label="' + word + r'" style="(width:56px;height:52px;border-radius:16px;display:grid;place-items:center;)(?:background:#f0d9cd)?">'
              r'<svg ([^>]*?)stroke="#[0-9a-f]+"([^>]*?)style="([^"]*?)color:#[0-9a-f]+;([^"]*)"')
        to = (f'<span role="button" tabIndex="⟦0⟧" onClick="⟦go(\'{tab}\')⟧" aria-current="⟦{cur} ? \'page\' : undefined⟧" '
              f'data-testid="tab-{tab}" class="btn" aria-label="⟦p.labels.{tab}⟧" style="\\1background:⟦{cur} ? \'@f0d9cd\' : \'transparent\'⟧">'
              f'<svg \\2stroke="currentColor"\\3style="\\4color:⟦{cur} ? \'@c2613f\' : \'@8d877d\'⟧;\\5"')
        nav, n = re.subn(rx, to, nav)
        if n != 1:
            raise SystemExit(f"nav tablet: tab {word} matched {n} times")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{NAV_TABLET_SRC} screen {NAV_SCREEN} (the <nav>) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n"
            "import type { NavTab } from \"./nav-laptop.gen\";\n\n"
            "export function NavTablet(p: { active: NavTab; onSelect: (tab: NavTab) => void; label: string; sayText: string; "
            "labels: Record<\"feed\" | \"tables\" | \"chats\" | \"me\", string> }) {\n"
            "  const go = (tab: NavTab) => () => p.onSelect(tab);  // no arrow in a slot: its > would end the tag\n"
            f"  return (\n    {to_jsx(nav, names)}\n  );\n}}\n")


def nav_tablet_frame_css() -> str:
    """The tablet's frame from the archive: the gap and the rail's width (the archive's top 62 holds its drawn status bar,
    which the app has not: the top takes the gap, as the sides do; brief, found along the way)."""
    b = blocks(NAV_TABLET_SRC)[NAV_SCREEN - 1]
    frame = re.search(r'<div style="position:absolute;left:(\d+)px;right:\d+px;top:\d+px;bottom:(\d+)px;display:flex;gap:(\d+)px"><nav style="width:(\d+)px', b)
    if not frame:
        raise SystemExit("nav tablet: the frame (inset, gap, nav width) is not found")
    inset, bottom, gap, width = frame.groups()
    if not (inset == gap == bottom):
        raise SystemExit(f"nav tablet: inset {inset}, bottom {bottom} and gap {gap} differ")
    return ("/* the tablet's frame (kypros-tablet.html screen 23): a screen drawn whole from the tablet file, the rail at its left */\n"
            f"main.nd-screen[data-width=\"tablet\"] {{ position: relative; height: 100dvh; }}\n"
            f"main.nd-screen[data-width=\"tablet\"] > .nd-nav-tablet {{ position: absolute; z-index: 3; left: {gap}px; top: {gap}px; bottom: {gap}px; width: {width}px; display: flex; }}\n"
            "main.nd-screen[data-width=\"tablet\"] > .nd-nav-tablet > nav { flex: 1; min-height: 0; }\n"
            f"main.nd-screen[data-width=\"tablet\"]:has(> .nd-nav-tablet) > .scr {{ position: absolute !important; left: {int(width) + 2 * int(gap)}px; top: {gap}px;"
            f" right: {gap}px; bottom: {gap}px; width: auto !important; height: auto !important; }}\n")


def render_place_row(names, src: str = BASE_FILE, suffix: str = "") -> str:
    """One row of screen 22's «Recent» (its first, Kafeneio Lemesos): the app lists the found places and the recent ones with it."""
    b = screen(src, 22)
    m = re.search(r'<div class="rise btn" style="--d:6;[^"]*">[\s\S]*?</svg></div>', b)
    if not m:
        raise SystemExit("place row: the first «Recent» row is not found")
    row = m[0]
    for rx, rep in [(r'^<div class="rise btn" style="--d:6;', '<div role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" data-testid="⟦p.testid⟧" class="rise btn" style="--d:⟦p.d⟧;'),
                    (r'>Kafeneio Lemesos<', '>⟦p.name⟧<'), (r'>· Old Town<', '>⟦p.sub⟧<')]:
        row, k = re.subn(rx, rep, row)
        if k != 1:
            raise SystemExit(f"place row: {rx} matched {k}")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen 22 (the first «Recent» row) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function PlaceRow{suffix.capitalize()}(p: {{ name: string; sub: string; onOpen: () => void; testid: string; d: number }}) {{\n"
            f"  return (\n    {to_jsx(row, names)}\n  );\n}}\n")


FEED_SCREEN = 283  # the plain feed: its phrase tile is the template of every tile the app lists


def render_feed_tile(names, src: str = BASE_FILE, suffix: str = "") -> str:
    """One phrase tile of the feed (screen 283's first, «350 m», with a likes count), and the «you liked» mark of its
    «120 m» tile put in beside the count: the app fills the distance, the fade, the text and its size per card."""
    arts = re.findall(r'<article class="tile rise"[\s\S]*?</article>', screen(src, FEED_SCREEN))
    if len(arts) < 2:
        raise SystemExit(f"feed tile: {src} screen {FEED_SCREEN} has {len(arts)} tiles")
    tile = arts[0]
    sizes = sorted({int(x) for x in re.findall(r"font:500 (\d+)px/1\.22 'Source Serif 4'", "".join(arts))}, reverse=True)
    if len(sizes) != 3:
        raise SystemExit(f"feed tile {src}: the serif's sizes are {sizes}, not three")
    mine = re.search(r'<span aria-label="you liked"[\s\S]*?</svg></span>', next((a for a in arts if 'aria-label="you liked"' in a), ""))
    if not mine:
        raise SystemExit("feed tile: no «you liked» mark on the feed")
    mark = mine[0].replace('aria-label="you liked"', 'aria-label="⟦p.mineLabel⟧" data-testid="liked-mark"', 1)
    for rx, rep in [
        (r'^<article class="tile rise" style="--d:0;', '<article role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" data-testid="⟦p.testid⟧" data-id="⟦p.id⟧" lang="⟦p.lang⟧" class="tile rise" style="--d:⟦p.d⟧;'),
        (r'>350 m<', ' data-testid="dist">⟦p.dist⟧<'),
        (r'<span aria-label="2 likes" ([^>]*)>([\s\S]*?</svg>)2</span>', lambda m: f"⟪mine⟫{mark}⟪/⟫⟪counted⟫<span aria-label=\"⟦p.likesLabel⟧\" data-testid=\"likes\" {m[1]}>{m[2]}⟦p.likes⟧</span>⟪/⟫"),
        (r'<i aria-label="fades"', '<i aria-label="⟦p.fadeLabel⟧" data-testid="fade"'),
        (r'width:70%;', 'width:⟦p.fade⟧;'),
        (r"font:500 21px/1\.22 ", "font:500 ⟦p.fs⟧/1.22 "),
        (r'>Swim at 7\? Bring goggles\.<', ' data-testid="card-open">⟦p.text⟧<'),
    ]:
        tile, k = re.subn(rx, rep, tile)
        if k != 1:
            raise SystemExit(f"feed tile {src}: {rx} matched {k}")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen {FEED_SCREEN} (the first phrase tile, "
            "the «you liked» mark of the fifth) by scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            "// the serif's three sizes on the archive's tiles, large to small: the app picks one by the text's length\n"
            f"export const FEED_TILE_FS = {{ l: \"{sizes[0]}px\", m: \"{sizes[1]}px\", s: \"{sizes[2]}px\" }} as const;\n\n"
            f"export function FeedTile{suffix.capitalize()}(p: {{ id: string; testid: string; d: number; lang?: string; dist: string; text: string; fs: string; "
            "fade: string; fadeLabel: string; likes: number; likesLabel: string; counted: boolean; mine: boolean; mineLabel: string; onOpen: () => void }) {\n"
            f"  return (\n    {to_jsx(tile, names)}\n  );\n}}\n")

def render_feed_own(names, src: str = BASE_FILE, suffix: str = "") -> str:
    """Screen 36: one's own phrase while it is checked, the first tile of the feed: outline, hourglass, «checking», no fade line."""
    tile = next((a for a in re.findall(r'<article class="tile rise"[\s\S]*?</article>', screen(src, 36)) if "checking · ~1 min" in a), None)
    if not tile:
        raise SystemExit(f"feed own: {src} screen 36 has no checking tile")
    for rx, rep in [
        (r'^<article class="tile rise" style="--d:0;', '<article role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" onKeyDown="⟦pressKey⟧" data-testid="sent" data-state="checking" data-id="⟦p.id⟧" lang="⟦p.lang⟧" class="tile rise" style="--d:0;'),
        (r'>checking · ~1 min<', ' data-testid="sent-status">⟦p.status⟧<'),
        (r"font:500 21px/1\.22 ", "font:500 ⟦p.fs⟧/1.22 "),
        (r'>Tavli tonight at the kafeneio\?<', ' data-testid="sent-text">⟦p.text⟧<'),
    ]:
        tile, k = re.subn(rx, rep, tile)
        if k != 1:
            raise SystemExit(f"feed own {src}: {rx} matched {k}")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen 36 (the checking tile) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            "const pressKey = (e: KeyboardEvent<HTMLElement>) => { if (e.key === \"Enter\" || e.key === \" \") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } };\n\n"
            f"export function FeedOwn{suffix.capitalize()}(p: {{ id?: string; lang?: string; status: string; text: string; fs: string; onOpen: () => void }}) {{\n"
            f"  return (\n    {to_jsx(tile, names)}\n  );\n}}\n")


def render_feed_loading(names, src: str = BASE_FILE, suffix: str = "") -> str:
    """Screen 40: the feed's masonry of ghosts (2, 3, 4 columns by the file), each with its running glint; no words, nothing from the app."""
    b = blocks(src)[39]
    i = b.index("<div data-feed")
    d = 0
    for m in re.finditer(r"<(/?)div\b", b[i:]):
        d += -1 if m[1] else 1
        if d == 0:
            ghost = b[i:i + m.start() + 6]
            break
    else:
        raise SystemExit(f"feed loading {src}: [data-feed] is not closed")
    if ghost.count('class="kwait"') != ghost.count('class="tile"') or not ghost.count('class="tile"'):
        raise SystemExit(f"feed loading {src}: not every ghost has its glint")
    ghost = ghost.replace("<div data-feed", '<div data-feed data-testid="loading" aria-hidden="true"', 1)
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen 40 (the [data-feed] ghosts) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties } from \"react\";\n\n"
            f"export function FeedLoading{suffix.capitalize()}() {{\n  return (\n    {to_jsx(ghost, names)}\n  );\n}}\n")


def render_safety(names) -> str:
    """Screen 121: the shield, the words, the code's tiles, the warning and the answer; the same at all three widths (checked here). The app keeps the bar and gives the node's groups."""
    rx = r'<div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center"><span class="rise" style="--d:0;width:84px[\s\S]*?Numbers match</span></div>'
    got = {src: re.search(rx, blocks(src)[120]) for src in (BASE_FILE, *_WIDTHS.values())}
    if not all(got.values()):
        raise SystemExit("safety: the body is not found")
    html = got[BASE_FILE][0]
    if any(m[0] != html for m in got.values()):
        raise SystemExit("safety: the widths draw different bodies")
    tile = re.search(r'<span style="height:46px[^>]*>4821</span>', html)
    if not tile:
        raise SystemExit("safety: the tile is not found")
    html, k = re.subn(r'((?:<span style="height:46px[^>]*>\d{4}</span>)+)', "⟦p.tiles⟧", html)
    if k != 1:
        raise SystemExit(f"safety: tiles matched {k}")
    for rx, rep in [
        (r'<p style="margin:0;font:600 24px([^"]*)">Safety code</p>', r'<p role="heading" aria-level="⟦1⟧" style="margin:0;font:600 24px\1">⟦p.title⟧</p>'),
        (r'>Compare it with Eleni when you meet<br>or on a call\. Same numbers — it’s her\.<', '>⟦p.line⟧<'),
        (r'<div class="rise" style="--d:1;display:grid', '<div data-testid="safety" class="rise" style="--d:1;display:grid'),
        (r'>If the numbers differ, don’t share anything private\.<', '>⟦p.warn⟧<'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onMatch⟧" data-testid="safety-match" class="cta rise btn"'),
        (r'</svg>Numbers match</span>', '</svg>⟦p.matchText⟧</span>'),
    ]:
        html, k = re.subn(rx, rep, html)
        if k != 1:
            raise SystemExit(f"safety: {rx} matched {k}")
    cell = tile[0].replace(">4821<", ">⟦p.text⟧<")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-phone.html screen 121 (the same at the other widths) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"export function SafetyTile(p: {{ text: string }}) {{\n  return (\n    {to_jsx(cell, names)}\n  );\n}}\n\n"
            "export function SafetyBody(p: { title: string; line: string; tiles: ReactNode; warn: string; matchText: string; onMatch?: () => void }) {\n"
            f"  return (\n    <div style={{{{ flex: 1, minHeight: 0, display: \"flex\", flexDirection: \"column\", gap: 14 }}}}>{to_jsx(html, names)}</div>\n  );\n}}\n")


def render_chat_parts(names) -> str:
    """Screens 115, 116, 117, 122: the banner, a menu tile, a span tile (off and on), the keys card, the parts the same at all three widths (checked here). The sheet's frame and the talk stay the app's."""
    parts = {
        "tile": (116, r'<span class="btn" style="flex:1;height:84px[^>]*><svg[\s\S]*?</svg>Keep longer</span>'),
        "off": (117, r'<span class="btn" style="flex:1;height:56px[^>]*><svg[\s\S]*?</svg>3 days</span>|<span class="btn" style="flex:1;height:56px[^>]*>3 days</span>'),
        "on": (117, r'<span class="btn" style="flex:1;height:56px[^>]*background:#c2613f[^>]*>(?:<svg[\s\S]*?</svg>)?1 day</span>'),
        "banner": (115, r'<div class="rise" style="--d:0;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:16px;background:#f0d9cd">[\s\S]*?No connection · messages wait here</span></div>'),
        "keys": (122, r'<div class="rise" style="--d:2;border-radius:22px;padding:14px 16px[\s\S]*?Compare code</span></div></div></div>'),
    }
    got = {}
    for key, (n, rx) in parts.items():
        ms = [re.search(rx, blocks(src)[n - 1]) for src in (BASE_FILE, *_WIDTHS.values())]
        if not all(ms):
            raise SystemExit(f"chat parts: {key} is not found at every width")
        if any(m[0] != ms[0][0] for m in ms):
            raise SystemExit(f"chat parts: {key} differs between the widths")
        got[key] = ms[0][0]
    def sub(html, pairs, what):
        for rx, rep in pairs:
            html, k = re.subn(rx, rep, html)
            if k != 1:
                raise SystemExit(f"chat parts {what}: {rx} matched {k}")
        return html
    btn = '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" aria-disabled="⟦p.off⟧" data-testid="⟦p.id⟧" class="btn"'
    tile = sub(got["tile"], [(r'^<span class="btn"', btn), (r'<svg[\s\S]*?</svg>Keep longer', '⟦p.mark⟧⟦p.text⟧')], "tile")
    radio = '<span role="radio" aria-checked="⟦p.on⟧" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" data-testid="⟦p.id⟧" class="btn"'
    off = sub(got["off"], [(r'^<span class="btn"', radio), (r'(?:<svg[\s\S]*?</svg>)?3 days', '⟦p.text⟧')], "off")
    on = sub(got["on"], [(r'^<span class="btn"', radio), (r'(?:<svg[\s\S]*?</svg>)?1 day', '⟦p.text⟧')], "on")
    banner = sub(got["banner"], [(r'^<div class="rise"', '<div role="status" data-testid="chat-offline" class="rise"'), (r'>No connection · messages wait here<', '>⟦p.text⟧<')], "banner")
    keys = sub(got["keys"], [
        (r'^<div class="rise"', '<div role="⟦p.role⟧" data-testid="⟦p.id⟧" class="rise"'),
        (r'>Eleni moved to a new device<', '>⟦p.title⟧<'),
        (r'<br><span style="([^"]*)">Her safety code changed</span>', '⟦p.line⟧'),
        (r'<span class="btn" style="flex:1;height:48px[^>]*>Later</span>', '⟦p.later⟧'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onGo⟧" aria-disabled="⟦p.busy⟧" data-testid="⟦p.goId⟧" class="cta rise btn"'),
        (r'</svg>Compare code</span>', '</svg>⟦p.goText⟧</span>'),
    ], "keys")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-phone.html screens 115, 116, 117, 122 (the same at the other widths) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"export function MenuTile(p: {{ id: string; mark: ReactNode; text: string; off?: boolean; onOpen?: () => void }}) {{\n  return (\n    {to_jsx(tile, names)}\n  );\n}}\n\n"
            f"export function SpanTile(p: {{ id: string; text: string; on: false; onOpen?: () => void }}) {{\n  return (\n    {to_jsx(off, names)}\n  );\n}}\n\n"
            f"export function SpanTileOn(p: {{ id: string; text: string; on: true; onOpen?: () => void }}) {{\n  return (\n    {to_jsx(on, names)}\n  );\n}}\n\n"
            f"export function ChatOffline(p: {{ text: string }}) {{\n  return (\n    {to_jsx(banner, names)}\n  );\n}}\n\n"
            f"export function KeysCard(p: {{ id: string; role?: string; title: string; line?: ReactNode; later?: ReactNode; goId: string; goText: string; busy?: boolean; onGo?: () => void }}) {{\n  return (\n    {to_jsx(keys, names)}\n  );\n}}\n")


def render_chat_ended(names, src: str = BASE_FILE, suffix: str = "") -> str:
    """Screen 124 (267 adds the ad slot, behind the flag): the middle and the actions only; the app's frame (the bar, a pane at 1440) stays around them."""
    rx = r'<div style="margin:auto 0;[\s\S]*?Back to talks</span></div></div>'
    m, m2 = re.search(rx, blocks(src)[123]), re.search(rx, blocks(src)[266])
    if not m or not m2:
        raise SystemExit(f"chat ended {src}: the block is not found")
    html = ad_splice(m[0], m2[0], f"chat ended {src} 267")
    for rx, rep in [
        (r'^<div style="margin:auto 0;', '<div data-testid="tombstone" style="margin:auto 0;'),
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">The talk has ended</p>', r'<p role="heading" aria-level="⟦2⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'>It faded with the phrase\.<br>Nothing from it is kept\.<', '>⟦p.line⟧<'),
        (r'<span aria-label="Safety tips" class="btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onSafety⟧" aria-label="⟦p.safetyLabel⟧" data-testid="show-safety" class="btn"'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" data-testid="chat-to-talks" class="cta rise btn"'),
        (r'</svg>Back to talks</span>', '</svg>⟦p.backText⟧</span>'),
    ]:
        html, k = re.subn(rx, rep, html)
        if k != 1:
            raise SystemExit(f"chat ended {src}: {rx} matched {k}")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{src} screen 124 (the middle and the actions) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function ChatEnded{suffix.capitalize()}(p: {{ title: string; line: string; safetyLabel: string; onSafety: () => void; backText: string; onBack: () => void; ad?: {AD_TYPE} }}) {{\n"
            f"  return (\n    <>{to_jsx(html, names)}</>\n  );\n}}\n")


def render_chat_tablet(names) -> str:
    """Screen 113 at the tablet: the pane, the head, the phrase's line from the archive; the live lines and the foot (stickers, the field) are data."""
    src = "kypros-tablet.html"
    html = screen(src, 113)
    html = re.sub(r'^(<div class="scr" style="[^"]*?background:)[^"]*"', r'\1var(--kit-scr-bg)"', html)
    html = re.sub(r"url\('data:[^']*'\)", "none", html)
    for rx, rep in [
        (r'<span class="btn" (style="width:48px;[^"]*">)(<svg[\s\S]*?</svg>)</span>(<div style="flex:1;min-width:0;line-height:1\.25">)',
         r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="chat-back" class="btn" \1\2</span>\3'),
        (r'(<span style="font:600 16\.5px[^"]*")>Eleni, 34<', r'\1 role="heading" aria-level="⟦1⟧">⟦p.who⟧<'),
        (r'<span style="font:500 12\.5px[^"]*">350 m</span>', ''),
        (r'(<i style="width:50px;[^"]*")>(<i style="display:block;)width:30%;', r'\1 role="img" aria-label="⟦p.leftLabel⟧" data-testid="chat-ring">\2width:⟦p.left⟧;'),
        (r'>fades in 3 h<', ' data-over="⟦p.overMark⟧">⟦p.line⟧<'),
        (r'(<span class="btn" aria-label="How this screen works")([\s\S]*?>\?</span>)',
         r'⟪help⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.help⟧" aria-label="⟦p.helpLabel⟧" data-testid="chat-help" class="btn"\2⟪/⟫'),
        (r'<span class="btn" (style="width:48px;[^"]*">)(<svg(?:(?!</svg>)[\s\S])*</svg>)</span>(</div><div class="rise" style="--d:0)',
         r'⟪onMore⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onMore⟧" aria-label="⟦p.moreLabel⟧" data-testid="chat-more" class="btn" \1\2</span>⟪/⟫\3'),
        (r'(<div class="rise" style="--d:0;[\s\S]*?)>Anyone up for a swim at Dasoudi tomorrow at 7\?</span></div>',
         r'⟪starter⟫\1 data-testid="starter-chip">⟦p.starter⟧</span></div>⟪/⟫'),
        (r'<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:8px">[\s\S]*?See you at 7 then 🙂</div></div>',
         r'<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:8px">⟦p.lines⟧</div>'),
        (r'<div style="display:flex;gap:6px"><span class="btn" aria-label="Wave"[\s\S]*?aria-label="Send"[\s\S]*?</svg></span></div>', '⟦p.foot⟧'),
    ]:
        html, k = re.subn(rx, rep, html, count=1)
        if k != 1:
            raise SystemExit(f"chat tablet: {rx} matched {k}")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-tablet.html screen 113 (the pane, the head, the phrase's line) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            "export function ChatScreenTablet(p: { backLabel: string; onBack: () => void; who: string; line: string; overMark?: string; left: string; leftLabel: string; "
            "moreLabel: string; onMore?: () => void; helpLabel: string; help?: () => void; starter?: string; lines: ReactNode; foot?: ReactNode }) {\n"
            f"  return (\n    {to_jsx(html, names)}\n  );\n}}\n")


def _same_on_widths(what: str, take) -> str:
    """One drawing for all widths: a width that draws it differently stops the run."""
    got = {src: take(src) for src in (BASE_FILE, *_WIDTHS.values())}
    if len(set(got.values())) != 1:
        raise SystemExit(f"{what}: the widths draw different blocks")
    return got[BASE_FILE]


def render_talks_empty(names) -> str:
    """Screen 109: the middle only, all three widths draw it the same; the app's frame (head, bar, panes) stays around it."""
    rx = r'<div style="flex:1;display:flex;flex-direction:column;align-items:center[\s\S]*?See phrases nearby</span></div></div>'
    def take(src):
        m = re.search(rx, blocks(src)[108])
        if not m:
            raise SystemExit(f"talks empty {src}: the block is not found")
        return m[0]
    html = _same_on_widths("talks empty", take)
    for rx2, rep in [
        (r'^<div style="flex:1;', '<div data-testid="quiet" style="flex:1;'),
        (r'<p style="([^"]*)">No talks yet</p>', r'<h2 style="\1">⟦p.title⟧</h2>'),
        (r'>A talk opens when you both like a phrase\.<br>It fades together with the phrase\.<', '>⟦p.line⟧<br>⟦p.line2⟧<'),
        (r'<span class="cta rise btn"', '⟪onGo⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onGo⟧" data-testid="talks-empty-go" class="cta rise btn"'),
        (r'</svg>See phrases nearby</span>', '</svg>⟦p.goText⟧</span>⟪/⟫'),
    ]:
        html, k = re.subn(rx2, rep, html)
        if k != 1:
            raise SystemExit(f"talks empty: {rx2} matched {k}")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-phone.html screen 109 (the middle; tablet and laptop draw the same) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            "export function TalksEmpty(p: { title: string; line: string; line2: string; goText: string; onGo?: () => void }) {\n"
            f"  return (\n    <>{to_jsx(html, names)}</>\n  );\n}}\n")


def render_talks_list(names) -> str:
    """Screen 108: the section label, the offer's two looks and the talk's row; all three widths draw them the same. The app fills the words,
    the fade and the fresh mark; where the archive writes a distance the app writes the last activity's time (a talk's row holds no distance)."""
    def take(src):
        b = blocks(src)[107]
        got = (re.search(r'<div style="display:flex;align-items:center;justify-content:space-between;min-height:44px"><span></span><span class="btn" aria-label="How this screen works"[\s\S]*?>\?</span></div>', b),
               re.search(r'<span style="font:700 11\.5px[^"]*">you both liked · say hi</span>', b),
               re.search(r'<span class="rise btn" style="--d:1;[\s\S]*?Eleni</span>', b),
               re.search(r'<span class="rise btn" style="--d:2;[\s\S]*?Andreas</span>', b),
               re.search(r'<div class="rise btn" style="--d:4;[\s\S]*?(?=<div class="rise btn" style="--d:5;)', b),
               re.search(r'<div class="rise btn" style="--d:5;[\s\S]*?</i></i></div></div></div>', b))
        if not all(got):
            raise SystemExit(f"talks list {src}: a block is not found")
        return "\0".join(m[0] for m in got)
    head, label, fresh, plain, first, row = _same_on_widths("talks list", take).split("\0")
    dot = re.search(r'<i style="width:10px;height:10px;border-radius:50%;[^"]*"></i>', first)
    if not dot:
        raise SystemExit("talks list: no fresh dot on the first row")
    def edit(what, html, subs):
        for rx, rep in subs:
            html, k = re.subn(rx, rep, html)
            if k != 1:
                raise SystemExit(f"talks list {what}: {rx} matched {k}")
        return html
    head = edit("head", head, [(r'<span class="btn" aria-label="How this screen works"([\s\S]*?>\?</span>)',
                                r'⟪help⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.help⟧" aria-label="⟦p.helpLabel⟧" data-testid="talks-help" class="btn"\1⟪/⟫')])
    label = edit("label", label, [(r'>you both liked · say hi<', '>⟦p.text⟧<')])
    chip = lambda d, name, html: edit(name, html, [
        (r'^<span class="rise btn" style="--d:\d;', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" aria-label="⟦p.label⟧" data-testid="open-match" class="rise btn" style="--d:' + str(d) + ';'),
        (rf'</svg>{name}</span>', '</svg>⟦p.name⟧</span>'),
    ])
    row = edit("row", row, [
        (r'^<div class="rise btn" style="--d:5;', '<div role="button" tabIndex="⟦p.off ? -1 : 0⟧" onClick="⟦p.onOpen⟧" aria-disabled="⟦p.off⟧" aria-current="⟦p.current⟧" data-testid="open-chat" class="rise btn nd-talk-row" style="--d:1;'),
        (r'>Sofia, 52<', '>⟦p.who⟧<'),
        (r'>200 m<', ' data-testid="chat-time">⟦p.meta⟧<'),
        (r'font:500 14px/1\.35 Golos Text;color:#6f685d;', "font:⟦p.fresh ? 600 : 500⟧ 14px/1.35 Golos Text;color:⟦p.fresh ? '@2a2926' : '@6f685d'⟧;"),
        (r'>Thank you for the lemons!<', ' data-testid="chat-line">⟦p.line⟧<'),
        (r'<div style="margin-top:8px"><i aria-label="fades"', '⟪fade⟫<div style="margin-top:8px"><i role="img" aria-label="⟦p.fadeLabel⟧" data-testid="chat-ring"'),
        (r'width:20%;', 'width:⟦p.fade⟧;'),
        (r'</i></i></div></div></div>$', '</i></i></div>⟪/⟫</div>⟪fresh⟫' + dot[0].replace('<i ', '<i role="img" aria-label="⟦p.freshLabel⟧" ', 1) + '⟪/⟫</div>'),
    ])
    props_chip = "{ name: string; label: string; onOpen: () => void }"
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-phone.html screen 108 (head, label, offers, a talk's row; tablet and laptop draw the same) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function TalksHead(p: {{ help?: () => void; helpLabel?: string }}) {{\n  return (\n    {to_jsx(head, names)}\n  );\n}}\n\n"
            f"export function TalksLabel(p: {{ text: string }}) {{\n  return (\n    {to_jsx(label, names)}\n  );\n}}\n\n"
            f"export function OfferChipFresh(p: {props_chip}) {{\n  return (\n    {to_jsx(chip(1, 'Eleni', fresh), names)}\n  );\n}}\n\n"
            f"export function OfferChip(p: {props_chip}) {{\n  return (\n    {to_jsx(chip(2, 'Andreas', plain), names)}\n  );\n}}\n\n"
            "export function TalkRow(p: { who: string; meta: string; line: string; fresh: boolean; freshLabel: string; fade?: string; fadeLabel?: string; off?: boolean; current?: \"true\"; onOpen: () => void }) {\n"
            f"  return (\n    {to_jsx(row, names)}\n  );\n}}\n")


def render_empty_panel(names) -> str:
    """Screen 44: the middle of the pane with nothing open; the pane itself (its place at 1440) stays the app's."""
    def take(src):
        m = re.search(r'<div style="margin:auto 0;[\s\S]*?It opens here\.</span></div>', blocks(src)[43])
        if not m:
            raise SystemExit(f"empty panel {src}: the block is not found")
        return m[0]
    html = _same_on_widths("empty panel", take)
    for rx, rep in [
        (r'>Nothing open<', '>⟦p.title⟧<'),
        (r'line-height:1\.45">Pick a phrase or a talk on the left\.<br>It opens here\.<', 'line-height:1.45;white-space:pre-line" data-testid="pane-hint">⟦p.hint⟧<'),
    ]:
        html, k = re.subn(rx, rep, html)
        if k != 1:
            raise SystemExit(f"empty panel: {rx} matched {k}")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 44 (the middle) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties } from \"react\";\n\n"
            f"export function EmptyPanel(p: {{ title: string; hint: string }}) {{\n  return (\n    <>{to_jsx(html, names)}</>\n  );\n}}\n")


def render_feed_hidden(names) -> str:
    """Screen 46: the toast after hiding a phrase; its bar, a frozen frame in the archive, runs out with the undo time. The list under it is the feed's own."""
    def take(src):
        m = re.search(r'<div class="ktoast"[\s\S]*?</i></i></div>', blocks(src)[45])
        if not m or "Phrase hidden" not in m[0]:
            raise SystemExit(f"feed hidden {src}: the toast is not found")
        return m[0]
    html = _same_on_widths("feed hidden", take)
    for rx, rep in [
        (r'^<div class="ktoast"', '<div data-testid="gone" data-why="hidden" class="ktoast"'),
        (r'>Phrase hidden<', '>⟦p.text⟧<'),
        (r'<span class="btn" style="([^"]*)">Undo<', r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onUndo⟧" data-testid="hidden-undo" class="btn" style="\1">⟦p.undoText⟧<'),
        (r'width:64%;height:100%;background:#fff', 'width:100%;height:100%;background:#fff;transform-origin:left;animation:nd4-undo-run ⟦p.ms⟧ linear both'),
    ]:
        html, k = re.subn(rx, rep, html)
        if k != 1:
            raise SystemExit(f"feed hidden: {rx} matched {k}")
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 46 (the toast) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function FeedHidden(p: {{ text: string; undoText: string; onUndo: () => void; ms: string }}) {{\n  return (\n    {to_jsx(html, names)}\n  );\n}}\n")


def _subs(what: str, html: str, subs) -> str:
    for rx, rep in subs:
        html, k = re.subn(rx, rep, html)
        if k != 1:
            raise SystemExit(f"{what}: {rx} matched {k}")
    return html


def render_my_marks(names) -> str:
    """Screen 49: the head (back, title, how many are still here) and one tile; the lit hand takes the like back. The fade line
    is fed as the feed's tile (`soon`, routes/likes.ts): the node gives no finer fade."""
    def head(src):
        m = re.search(r'<div style="display:flex;align-items:center;gap:12px;min-height:48px">[\s\S]*?</span></div>', blocks(src)[48])
        if not m or ">Liked<" not in m[0]:
            raise SystemExit(f"my marks {src}: the head is not found")
        return m[0]
    def tile(src):
        m = re.search(r'<article class="tile rise"[\s\S]*?</article>', blocks(src)[48])
        if not m or ">350 m<" not in m[0]:
            raise SystemExit(f"my marks {src}: the tile is not found")
        return m[0]
    h = _subs("my marks head", _same_on_widths("my marks head", head), [
        (r'<span class="btn" style="width:48px', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="likes-back" class="btn" style="width:48px'),
        _HELP,
        (r'<p style="([^"]*)">Liked</p>', r'<h1 style="\1">⟦p.title⟧</h1>'),
        (r'>4 still here<', ' data-testid="likes-count">⟦p.count⟧<'),
    ])
    t = _subs("my marks tile", _same_on_widths("my marks tile", tile), [
        (r'^<article class="tile rise" style="--d:0;', '<article data-testid="liked-card" data-id="⟦p.id⟧" lang="⟦p.lang⟧" class="tile rise" style="--d:⟦p.d⟧;'),
        (r'>350 m<', ' data-testid="dist">⟦p.dist⟧<'),
        (r'<span aria-label="you liked" ', '<span role="button" tabIndex="⟦p.off ? -1 : 0⟧" onClick="⟦p.off ? undefined : p.onUnlike⟧" aria-pressed="true" aria-disabled="⟦p.off⟧" aria-label="⟦p.unlikeLabel⟧" data-testid="unlike" class="k-mark-btn" '),
        (r'<i aria-label="fades"', '<i aria-label="⟦p.fadeLabel⟧" data-testid="fade"'),
        (r'width:70%;', 'width:⟦p.fade⟧;'),
        (r"font:500 21px/1\.22 ", "font:500 ⟦p.fs⟧/1.22 "),
        (r'>Swim at 7\? Bring goggles\.</p>', '>⟦p.text⟧</p>⟪note⟫<span data-testid="spent" style="font:500 13.5px/1.25 Golos Text,serif;color:#6f685d">⟦p.note⟧</span>⟪/⟫'),
    ])
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 49 (the head, a tile) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function MyMarksHead(p: {{ backLabel: string; onBack: () => void; title: string; count: string }}) {{\n  return (\n    {to_jsx(h, names)}\n  );\n}}\n\n"
            "export function MyMarksTile(p: { id: string; d: number; lang?: string; dist: string; text: string; fs: string; fade: string; fadeLabel: string; off: boolean; unlikeLabel: string; onUnlike: () => void; note?: string }) {\n"
            f"  return (\n    {to_jsx(t, names)}\n  );\n}}\n")


def render_my_marks_empty(names) -> str:
    """Screen 50: the middle with nothing liked; the head above it is 49's, at 1440 the feed's own."""
    def take(src):
        rx = r'<div style="flex:1;display:flex;flex-direction:column;align-items:center[\s\S]*?See phrases nearby</span></div>(?:<div style="height:18px"></div><div class="rise" data-ad=[\s\S]*?</div>)?</div>'
        m, m2 = re.search(rx, blocks(src)[49]), re.search(rx, blocks(src)[270])
        if not m or not m2:
            raise SystemExit(f"my marks empty {src}: the block is not found")
        return ad_splice(m[0], m2[0], f"my marks empty {src} 271")
    html = _subs("my marks empty", _same_on_widths("my marks empty", take), [
        (r'^<div style="flex:1;', '<div data-testid="quiet" style="flex:1;'),
        (r'<p style="([^"]*)">Nothing liked yet</p>', r'<h2 style="\1">⟦p.title⟧</h2>'),
        (r'line-height:1\.45">Tap (<svg[\s\S]*?</svg>) on a phrase you’re up for\.<br>It stays here until it fades\.<', r'line-height:1.45;white-space:pre-line">⟦p.before⟧\1⟦p.after⟧<'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onGo⟧" data-testid="likes-go" class="cta rise btn"'),
        (r'</svg>See phrases nearby<', '</svg>⟦p.goText⟧<'),
    ])
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 50 (the middle) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function MyMarksEmpty(p: {{ title: string; before: string; after: string; goText: string; onGo: () => void; ad?: {AD_TYPE} }}) {{\n  return (\n    {to_jsx(html, names)}\n  );\n}}\n")


_CARD_COL = '<div style="position:absolute;left:14px;right:14px;top:'


def _card_col(src: str, n: int) -> str:
    """The card's column of screen n: the last one in the block (at 1440 the feed stands before it)."""
    b = blocks(src)[n - 1]
    i = b.rfind(_CARD_COL)
    if i < 0:
        raise SystemExit(f"card {src} {n}: no column")
    return b[i:]


def _card_piece(what: str, rx: str, n: int) -> str:
    """One piece of the card's column: every width draws it the same."""
    def take(src):
        m = re.search(rx, _card_col(src, n))
        if not m:
            raise SystemExit(f"card {what} {src}: not found")
        return m[0]
    return _same_on_widths(f"card {what}", take)


def _mode_icon(word: str) -> str:
    """The inside of the composer's (screen 59) icon of a mode: the card's chip draws it in its own svg."""
    m = re.search(r'<svg (?:(?!<svg)[\s\S])*?>((?:(?!<svg)[\s\S])*?)</svg>' + word + '<', blocks(BASE_FILE)[58])
    if not m:
        raise SystemExit(f"card: no icon of «{word}» on screen 59")
    return m[1]


def render_ad(names) -> str:
    """Screens 263 (the slot under the liked list) and 261 (a sponsored tile among the phrases): the ad pieces that stand on their own.
    The other ad screens put a slot inside their base screen's family (AD_SUBS). Every width draws them the same."""
    slot = _same_on_widths("ad slot", lambda src: re.search(r'<div class="rise" data-ad="under Liked"[\s\S]*?</div>', blocks(src)[262])[0])
    slot = _subs("ad slot", slot, AD_SUBS[:1] + AD_SUBS[1:])
    native = _same_on_widths("ad native", lambda src: re.search(r'<article class="tile" data-ad="feed-native"[\s\S]*?</article>', blocks(src)[260])[0])
    native = _subs("ad native", native, [
        (r'data-ad="feed-native"', 'data-testid="ad-native" data-ad="feed-native"'),
        (r'>Sponsored<', '>⟦p.sponsored⟧<'),
        (r'>ad slot<', '>⟦p.slot⟧<'),
        (r'>Fresh bread till 9 at Pane &amp; Co, 300 m<|>Fresh bread till 9 at Pane & Co, 300 m<', '>⟦p.text⟧<'),
        (r'>native · same size as a phrase<', '>⟦p.note⟧<'),
    ])
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screens 263 (the slot), 261 (the sponsored tile) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function AdSlot(p: {{ ad?: {AD_TYPE} }}) {{\n  return (\n    <>{{p.ad && (\n    {to_jsx(slot, names)}\n    )}}</>\n  );\n}}\n\n"
            "export function AdNative(p: { sponsored: string; slot: string; text: string; note: string }) {\n"
            f"  return (\n    {to_jsx(native, names)}\n  );\n}}\n")


def render_card_in(names) -> str:
    """Screens 51 (a phrase I'm in on) and 53's hand (not yet): the frame per width, the head, the phrase, the chips, the note, both hands."""
    def frame(src, pane):
        col = re.match(r'<div style="([^"]*)">', _card_col(src, 51))[1]
        # the column scrolls a long phrase; its edge moves out to the frame's so the scroll does not cut the buttons' shadows
        col = _subs("card column", col, [(r'left:14px;right:14px;', 'left:0;right:0;padding:0 14px 26px;'), (r'bottom:26px;', 'bottom:0;')])
        inner = f'<div style="{col};overflow-y:auto">⟦p.children⟧</div>'
        if not pane:
            return f'<div style="flex:1;min-height:0;position:relative;margin:-8px">{inner}</div>'
        b = blocks(src)[50]
        m = list(re.finditer(pane, b))
        if not m:
            raise SystemExit(f"card frame {src}: no pane")
        return f'<div class="scr" style="{m[-1][1]};flex:1;min-height:0">{inner}</div>'
    fr = {"": frame(BASE_FILE, None),
          "Tablet": frame("kypros-tablet.html", r'<div style="(flex:1;min-width:0;position:relative;height:100%;border-radius:24px;[^"]*)"><div class="wideapp"'),
          "Laptop": frame("kypros-laptop.html", r'<div style="width:440px;flex:none;(position:relative;height:100%;border-radius:24px;[^"]*)">')}
    head = _subs("card head", _card_piece("head", r'<div style="display:flex;align-items:center;gap:8px;min-height:48px">[\s\S]*?</div>', 51), [
        (r'^(<div style="[^"]*")>(<span class="btn" )', r'\1>\2role="button" tabIndex="⟦0⟧" onClick="⟦p.onBack⟧" aria-label="⟦p.backLabel⟧" data-testid="back" '),
        _HELP,
        (r'</span></span><span class="btn" ', '</span></span><span role="button" tabIndex="⟦0⟧" onClick="⟦p.onMore⟧" aria-label="⟦p.moreLabel⟧" data-testid="more-menu" class="btn" '),
    ])
    phrase = _subs("card phrase", _card_piece("phrase", r'<section class="rise sheen"[\s\S]*?</section>', 51), [
        (r'>350 m<', ' data-testid="dist">⟦p.dist⟧<'),
        (r"font:500 32px/1\.22 ([^\"]*\")>Anyone up for a swim at Dasoudi tomorrow at 7\? Bring goggles\.<",
         r"""font:500 ⟦p.fs ?? '32px'⟧/1.22 \1 lang="⟦p.lang⟧" data-testid="text">⟦p.text⟧<"""),
        (r'width:72%;', 'width:⟦p.fade⟧;'),
        (r'>fades in 3 h<', ' data-testid="fade">⟦p.fadeText⟧<'),
    ])
    chips = _card_piece("chips", r'<div class="rise" style="--d:2;display:flex;gap:8px;white-space:nowrap">[\s\S]*?</span></div>', 51)
    shell = re.findall(r'<svg [^>]*>', chips)[1]
    modes = "".join(f"⟪{k}⟫{shell}{_mode_icon(w)}</svg>⟪/⟫" for k, w in (("alone", "just me"), ("friend", "with a friend"), ("group", "a group")))
    lang_chip = re.search(r'<span style="display:inline-flex[^"]*font:500 14px[^"]*">', chips)[0]
    chips = _subs("card chips", chips, [
        (r'flex;gap:8px;white-space:nowrap"', 'flex;flex-wrap:wrap;gap:8px"'),
        (r'<span aria-label="3 likes"', '<span aria-label="⟦p.likesLabel⟧" data-testid="card-likes"'),
        (r'</svg>3</span>', '</svg>⟦p.likes⟧</span>'),
        (r'<svg [^>]*><circle cx="24" cy="14"[\s\S]*?</svg>comes alone</span>', modes + '<span data-testid="mode">⟦p.mode⟧</span></span>⟪language⟫' + lang_chip + '⟦p.language⟧</span>⟪/⟫'),
    ])
    note = _subs("card note", _card_piece("note", r'<div class="rise" style="--d:3;margin-top:auto;text-align:center">[\s\S]*?</div>', 51), [
        (r'^(<div class="rise" style="[^"]*")>', r'\1 role="status" data-testid="⟦p.testid⟧" data-state="⟦p.state⟧">'),
        (r'>Liked\. If they like you back, a talk opens\.<', '>⟦p.text⟧<'),
    ])
    lit = _subs("card lit hand", _card_piece("lit hand", r'<div class="rise" style="--d:4;display:flex;justify-content:center">[\s\S]*?</span></div>', 51), [
        (r'<span class="btn kcta" role="button" aria-label="Like" aria-pressed="true"',
         '<span class="btn kcta" role="button" tabIndex="⟦p.off ? -1 : 0⟧" onClick="⟦p.off ? undefined : p.onUnlike⟧" aria-label="⟦p.label⟧" aria-pressed="true" aria-disabled="⟦p.off⟧" data-testid="unlike" data-lit=""'),
    ])
    off = _subs("card hand", _card_piece("hand", r'<div class="rise" style="--d:4;margin-top:auto;display:flex;justify-content:center">[\s\S]*?</span></div>', 53), [
        (r'margin-top:auto;', 'margin-top:⟦p.top⟧;'),
        (r'<span class="btn kcta" role="button" aria-label="Like" aria-pressed="false"',
         '<span class="btn kcta" role="button" tabIndex="⟦p.off ? -1 : 0⟧" onClick="⟦p.off ? undefined : p.onLike⟧" aria-label="⟦p.label⟧" aria-pressed="false" aria-disabled="⟦p.off⟧" data-testid="like"'),
    ])
    frames = "".join(f"export function CardFrame{k}(p: {{ children: ReactNode }}) {{\n  return (\n    {to_jsx(v, names)}\n  );\n}}\n\n" for k, v in fr.items())
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screens 51, 53 (the hand), 59 (the mode's icons) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n" + frames +
            f"export function CardHead(p: {{ backLabel: string; onBack: () => void; moreLabel: string; onMore: () => void }}) {{\n  return (\n    {to_jsx(head, names)}\n  );\n}}\n\n"
            f"export function CardPhrase(p: {{ dist: string; text: string; fs?: string; lang?: string; fade: string; fadeText: string }}) {{\n  return (\n    {to_jsx(phrase, names)}\n  );\n}}\n\n"
            f"export function CardChips(p: {{ likesLabel: string; likes: number; alone: boolean; friend: boolean; group: boolean; mode: string; language?: string }}) {{\n  return (\n    {to_jsx(chips, names)}\n  );\n}}\n\n"
            f"export function CardNote(p: {{ testid: string; state?: string; text: string }}) {{\n  return (\n    {to_jsx(note, names)}\n  );\n}}\n\n"
            f"export function CardHandLit(p: {{ label: string; off: boolean; onUnlike: () => void }}) {{\n  return (\n    {to_jsx(lit, names)}\n  );\n}}\n\n"
            f"export function CardHand(p: {{ label: string; off: boolean; top: string; onLike: () => void }}) {{\n  return (\n    {to_jsx(off, names)}\n  );\n}}\n")


def render_card_both(names) -> str:
    """Screen 52: the foot of a phrase we are both in on, the like's line and «Open talk»."""
    foot = _subs("card both", _card_piece("both line", r'<div class="rise" style="--d:2;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:auto">[\s\S]*?</span></div>', 52), [
        (r'^(<div class="rise" style="[^"]*")>', r'\1 role="status" data-testid="matched">'),
        (r'>You both liked · <', '>⟦p.line⟧<'),
        (r'>Eleni, 34<', '>⟦p.name⟧<'),
    ])
    cta = _subs("card talk", _card_piece("talk", r'<span class="cta rise btn"[\s\S]*?</span>', 52), [
        (r'^<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onTalk⟧" data-testid="talk" class="cta rise btn"'),
        (r'>Open talk<', '>⟦p.talkText⟧<'),
    ])
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 52 by scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            f"export function CardBothLine(p: {{ line: string; name: string }}) {{\n  return (\n    {to_jsx(foot, names)}\n  );\n}}\n\n"
            f"export function CardBothTalk(p: {{ talkText: string; onTalk?: () => void }}) {{\n  return (\n    {to_jsx(cta, names)}\n  );\n}}\n")


def render_offer_card(names) -> str:
    """Screen 62 `offer-card`: a venue's offer as a card. It stands in the phrase card's frame and head (screen 51), so only what differs is
    drawn here: the panel (venue, offer, conditions, the end), the chips («from the venue» and the discount), and the foot (the venue's
    link, a round button, beside the main hand). The hand's states (liked, both in) stay the phrase card's pieces."""
    panel = _subs("offer panel", _card_piece("panel", r'<section class="rise"[\s\S]*?</section>', 62), [
        (r'>Kalinda Café · 200 m<', '><span data-testid="offer-venue">⟦p.venue⟧</span>⟪dist⟫<> · ⟦p.dist⟧</>⟪/⟫<'),
        (r"(font:600 30px/1\.22 [^\"]*\")>−15% for two on coffee and cake<", r"""\1 lang="⟦p.lang⟧" data-testid="text">⟦p.text⟧<"""),
        (r'(<span style="font:500 15px/1\.25 Golos Text,serif;color:#6f685d;display:block;margin-top:12px;line-height:1\.45")>Weekdays 14:00–18:00\. Show this card at the counter\.</span>',
         r'⟪conditions⟫\1 data-testid="conditions">⟦p.conditions⟧</span>⟪/⟫'),
        (r'width:40%;', 'width:⟦p.fade⟧;'),
        (r'>ends in 2 h<', ' data-testid="fade">⟦p.fadeText⟧<'),
    ])
    row = _card_piece("chips", r'<div class="rise" style="--d:2;display:flex;gap:8px;white-space:nowrap">[\s\S]*?</span></div>', 62)
    chip = re.search(r'<span style="display:inline-flex[\s\S]*?</span>', row)[0]
    if chip.count("from the venue") != 1:
        raise SystemExit("offer chips: the archive's chip is not found")
    chips = _subs("offer chips", row, [
        (r'white-space:nowrap"', 'flex-wrap:wrap"'),
        (r'>from the venue</span>', '>⟦p.fromVenue⟧</span>' + chip.replace("<span ", '<span data-testid="offer" ', 1).replace("from the venue", "⟦p.discount⟧")),
    ])
    foot = _card_piece("foot", r'<div class="btnrow"[\s\S]*?</span>\s*</div>\s*</div>', 62)
    link = re.search(r'<span class="btn" style="width:58px[\s\S]*?</svg></span>', foot)[0]
    link = _subs("offer link", link, [
        (r'^<span class="btn" ', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onLink⟧" aria-label="⟦p.linkLabel⟧" data-testid="offer-link" class="btn" '),
    ])
    cta = re.search(r'<span class="cta rise btn"[\s\S]*?</span>', foot)[0]
    cta = _subs("offer cta", cta, [
        (r'^<span class="cta rise btn"', '<span role="button" tabIndex="⟦p.off ? -1 : 0⟧" onClick="⟦p.off ? undefined : p.onLike⟧" aria-disabled="⟦p.off⟧" data-testid="like" class="cta rise btn"'),
        (r'</svg>Say it with this offer</span>', '</svg>⟦p.label⟧</span>'),
    ])
    row_open = re.match(r'<div class="btnrow" style="[^"]*">', foot)[0]
    col_open = re.search(r'<div style="flex:1;min-width:0;display:flex;flex-direction:column">', foot)[0]
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 62 by scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"export function OfferPanel(p: {{ venue: string; dist: string; text: string; lang?: string; conditions: string; fade: string; fadeText: string }}) {{\n  return (\n    {to_jsx(panel, names)}\n  );\n}}\n\n"
            f"export function OfferChips(p: {{ fromVenue: string; discount: string }}) {{\n  return (\n    {to_jsx(chips, names)}\n  );\n}}\n\n"
            f"export function OfferFoot(p: {{ linkLabel: string; onLink?: () => void; children: ReactNode }}) {{\n  return (\n    {to_jsx(row_open + '⟪onLink⟫' + link + '⟪/⟫' + col_open + '⟦p.children⟧</div></div>', names)}\n  );\n}}\n\n"
            f"export function OfferHand(p: {{ label: string; off: boolean; onLike: () => void }}) {{\n  return (\n    {to_jsx(cta, names)}\n  );\n}}\n")


def _sheet(src: str, n: int) -> str:
    """A screen's sheet over the card: the archive's dim and its .wpop, cut at the .wpop's own closing tag."""
    b = blocks(src)[n - 1]
    pop = b.find('<div class="wpop"')
    if pop < 0:
        raise SystemExit(f"sheet {src} {n}: no .wpop")
    dim = b.rfind('<div style="position:absolute;inset:0;z-index:20;', 0, pop)
    if dim < 0:
        raise SystemExit(f"sheet {src} {n}: no dim")
    depth = 0
    for m in re.finditer(r'<div\b|</div>', b[pop:]):
        depth += 1 if m[0] != "</div>" else -1
        if depth == 0:
            return b[dim:pop + m.end()]
    raise SystemExit(f"sheet {src} {n}: the .wpop does not close")


def _sheets(what: str, n: int, subs, props: str, name: str, names, head: str) -> str:
    """The sheet of screen n as two components: the phone's bottom sheet, the wide dialog (820 and 1440 draw one)."""
    wide = {src: _sheet(src, n) for src in _WIDTHS.values()}
    if len(set(wide.values())) != 1:
        raise SystemExit(f"{what}: the wide widths draw different sheets")
    dim = (r'^<div style="(position:absolute;inset:0;z-index:20;[^"]*)"></div><div class="wpop"', r'<div onClick="⟦p.onClose⟧" style="\1"></div><div class="wpop"')
    def part(html):
        return f"<>{to_jsx(_subs(what, html, [dim, *subs]), names)}</>"
    return (head + f"export function {name}(p: {props}) {{\n  return (\n    {part(_sheet(BASE_FILE, n))}\n  );\n}}\n\n"
            f"export function {name}Wide(p: {props}) {{\n  return (\n    {part(next(iter(wide.values())))}\n  );\n}}\n")


def render_card_need(names) -> str:
    """Screen 53: pressing the hand with no phrase of one's own opens «Say something first»."""
    subs = [
        (r'<div class="wpop" style="', '<div class="wpop" data-testid="card-need" style="'),
        (r'<p (style="margin:0;font:600 22px[^"]*")>Say something first<', r'<p role="heading" aria-level="⟦2⟧" \1>⟦p.title⟧<'),
        (r'(<span style="font:500 15px/1\.25 Golos Text,serif;color:#6f685d;display:block;margin:8px 0 18px;line-height:1\.45)">To like, have a phrase of your own nearby\.<br>That’s how neighbours see you too\.<',
         r'\1;white-space:pre-line" data-testid="need-phrase">⟦p.text⟧<'),
        (r'<span class="btn" (style="flex:1;height:56px;[^"]*")>Not now<', r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onClose⟧" data-testid="need-later" class="btn" \1>⟦p.laterText⟧<'),
        (r'<span class="cta rise btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onSay⟧" data-testid="need-say" class="cta rise btn"'),
        (r'>Write a phrase<', '>⟦p.sayText⟧<'),
    ]
    return _sheets("card need", 53, subs, "{ onClose: () => void; title: string; text: string; laterText: string; sayText: string; onSay: () => void }", "CardNeedSheet", names,
                   "// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 53 (the sheet) by scripts/design/nd4-extract.py; do not edit\n"
                   "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n")


def render_card_more(names) -> str:
    """Screen 54: the card's «…». The app's error line stands above «Cancel»; the panels of «Report» and «Block» wait for rows 56, 57."""
    def item(word, sub, testid, key):
        return (r'<div class="btn" (style="display:flex;align-items:center;gap:14px;height:62px;padding:0 6px">(?:(?!<div class="btn")[\s\S])*?)>' + word + r'</span><br>(<span [^>]*)>' + sub + '<',
                f'<div role="button" tabIndex="⟦p.busy ? -1 : 0⟧" aria-disabled="⟦p.busy⟧" onClick="⟦p.busy ? undefined : p.on{key}⟧" data-testid="{testid}" class="btn" \\1>⟦p.{testid}Text⟧</span><br>\\2>⟦p.{testid}Sub⟧<')
    subs = [
        (r'<div class="wpop" style="', '<div class="wpop" data-testid="card-more" data-panel="menu" style="'),
        item("Hide this phrase", "you can undo for 5 seconds", "hide", "Hide"),
        item("Report", "tell us what’s wrong", "notice", "Notice"),
        item("Block", "their phrases and tables disappear", "block", "Block"),
        (r'(<div style="display:flex;flex-direction:column">)<span class="btn" (style="margin-top:10px;height:54px;[^"]*")>Cancel<',
         r'⟦p.error⟧\1<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onClose⟧" data-testid="more-cancel" class="btn" \2>⟦p.cancelText⟧<'),
    ]
    return _sheets("card more", 54, subs,
                   "{ onClose: () => void; busy: boolean; hideText: string; hideSub: string; onHide: () => void; noticeText: string; noticeSub: string; onNotice: () => void; "
                   "blockText: string; blockSub: string; onBlock: () => void; cancelText: string; error?: ReactNode }", "CardMoreSheet", names,
                   "// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screen 54 (the sheet) by scripts/design/nd4-extract.py; do not edit\n"
                   "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n")


def render_confirm(names) -> str:
    """Screens 8, 56, 92, 93, 123: the one layout of every confirmation (the middle and the two answers; the app's frame and back button
    stay around them). 8, 56, 93, 123 draw it with the danger answer outlined, 92 (pass) with the filled one: one component each.
    The same at all three widths and the same for every screen of its kind (checked here); the app gives the mark, the words and the handlers."""
    rx = r'<div style="margin:auto 0;[\s\S]*?</svg>[^<]+</span></div></div>'
    skel = lambda h: re.sub(r">[^<>]+<", "><", re.sub(r"<br>", "", re.sub(r"<svg[\s\S]*?</svg>", "<S/>", h)))
    got = {}
    for n in (8, 56, 92, 93, 123):
        for src in (BASE_FILE, *_WIDTHS.values()):
            m = re.search(rx, blocks(src)[n - 1])
            if not m:
                raise SystemExit(f"confirm: {src} screen {n} has no body")
            got[(n, src)] = m[0]
        if len({got[(n, s)] for s in (BASE_FILE, *_WIDTHS.values())}) != 1:
            raise SystemExit(f"confirm: screen {n} differs between the widths")
    for n in (56, 93, 123):
        if skel(got[(n, BASE_FILE)]) != skel(got[(8, BASE_FILE)]):
            raise SystemExit(f"confirm: screen {n} no longer draws screen 8's layout")
    subs = [
        (r'^<div style="margin:auto 0;', '<div data-testid="⟦p.id⟧" style="margin:auto 0;'),
        (r'(<span class="rise" style="[^"]*">)<svg[\s\S]*?</svg></span>', r'\1<span class="nd4-cf-ic" aria-hidden="⟦true⟧">⟦p.mark⟧</span></span>'),
        (r'<p style="margin:0;font:600 (\d+)px([^"]*)">[\s\S]*?</p>', r'<p role="heading" aria-level="⟦2⟧" style="margin:0;font:600 \1px\2">⟦p.title⟧</p>'),
        (r'(<span style="font:500 15px/1\.25 Golos Text,serif;[^"]*")>[\s\S]*?</span></div><div style="display:flex;flex-direction:column;gap:14px"><div ([^>]*)>[\s\S]*?</div>',
         r'\1>⟦p.lead⟧</span></div><div style="display:flex;flex-direction:column;gap:14px"><div \2>⟦p.price⟧</div>'),
        (r'<span class="btn" (style="flex:1;height:58px;border-radius:22px;background:linear-gradient[^"]*")>Cancel<',
         r'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onCancel⟧" data-testid="⟦p.cancelId⟧" class="btn" \1>⟦p.cancelText⟧<'),
        (r'<span class="btn" (style="flex:1;height:58px;border-radius:22px;display:flex[^"]*")>(<svg[\s\S]*?</svg>)[^<]+</span>',
         r'<span role="button" tabIndex="⟦p.busy ? -1 : 0⟧" aria-disabled="⟦p.busy⟧" onClick="⟦p.busy ? undefined : p.onOk⟧" data-testid="⟦p.okId⟧" class="btn" \1><span class="nd4-cf-sm" aria-hidden="⟦true⟧">⟦p.okMark⟧</span>⟦p.okText⟧</span>'),
    ]
    props = "{ id: string; mark: ReactNode; title: ReactNode; lead: ReactNode; price: ReactNode; cancelId: string; cancelText: string; onCancel: () => void; okId: string; okText: string; okMark: ReactNode; onOk: () => void; busy?: boolean }"
    def part(n):
        html = _subs(f"confirm {n}", got[(n, BASE_FILE)], subs)
        if n == 92:  # the pass is drawn in the text color, the danger answers in the accent
            html = html.replace('class="nd4-cf-ic"', 'class="nd4-cf-ic nd4-cf-plain"')
        return to_jsx(html, names)
    return ("// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/kypros-{phone,tablet,laptop}.html screens 8, 56, 92, 93, 123 (the middle and the two answers) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"export function ConfirmDanger(p: {props}) {{\n  return (\n    <>{part(8)}</>\n  );\n}}\n\n"
            f"export function ConfirmPlain(p: {props}) {{\n  return (\n    <>{part(92)}</>\n  );\n}}\n")


def confirm_css() -> str:
    """The confirmation's icons: the archive draws them at 52 and 20 px; the app's icon fills the box it is given."""
    return ("\n/* the confirmation (screens 8, 56, 92, 93, 123): the app's icons at the archive's sizes */\n"
            ".nd4-cf-ic{display:grid;place-items:center;width:52px;height:52px;color:var(--accent)}\n"
            ".nd4-cf-plain{color:var(--text)}\n"
            ".nd4-cf-sm{display:grid;place-items:center;width:20px;height:20px}\n"
            ".nd4-cf-ic .nd-icon,.nd4-cf-sm .nd-icon{width:100%;height:100%}\n")


def sheet_layer_css() -> str:
    """A sheet drawn from the archive brings its own dim and box: the shell's layer gives up its own for it."""
    return ("\n/* a sheet from the archive (screens 53, 54): the shell's .layer-sheet and .dim step aside */\n"
            ".layers:has(.wpop) .layer-sheet:has(> .wpop){inset:0;width:auto;padding:0;background:none;border-radius:0;box-shadow:none;animation:none;display:block}\n"
            ".layer-sheet:has(> .wpop)::before{display:none}\n"
            ".layers:has(.layer-sheet > .wpop) .dim{opacity:0}\n")


def render_nav_phone(names) -> str:
    """The phone's bar (the 39 phone screens that draw a nav draw this one): four icons, the current with the archive's dot.
    Its colors are the archive's: the current tab #2f5a8f, the others #8d877d; the words are aria-labels (the archive has none)."""
    b = blocks(BASE_FILE)[FEED_SCREEN - 1]
    if re.search("[⟦⟧⟪⟫]", b):
        raise SystemExit("nav phone: the archive holds a slot marker ⟦⟧⟪⟫; refusing to make it code")
    nav = re.search(r"<nav[\s\S]*?</nav>", b)[0]
    head, *spans = re.split(r'(?=<span style="flex:1;display:grid)', nav)
    tabs = list(NAV_TABS.values())
    if len(spans) != len(tabs):
        raise SystemExit(f"nav phone: {len(spans)} tabs in the archive, {len(tabs)} in the app")
    dot = re.search(r'<i style="position:absolute;bottom:4px;[^"]*"></i>', "".join(spans))
    if not dot:
        raise SystemExit("nav phone: the current tab's dot is not found")
    out = []
    for tab, sp in zip(tabs, spans):
        cur = f"p.active === '{tab}'"
        sp = sp.replace(dot[0], "")
        sp, k = re.subn(r'^<span style="', f'<span role="button" tabIndex="⟦0⟧" onClick="⟦go(\'{tab}\')⟧" aria-label="⟦p.labels.{tab}⟧" aria-current="⟦{cur} ? \'page\' : undefined⟧" data-testid="tab-{tab}" class="btn" style="', sp)
        sp, k2 = re.subn(r'stroke="#[0-9a-f]+"', 'stroke="currentColor"', sp, count=1)
        sp, k3 = re.subn(r'color:#[0-9a-f]+;--ifill:[^;]*;', f"color:⟦{cur} ? '@2f5a8f' : '@8d877d'⟧;--ifill:none;", sp)
        if not (k == k2 == k3 == 1):
            raise SystemExit(f"nav phone: tab {tab} matched {k},{k2},{k3}")
        sp, k = re.subn(r"</span>(</nav>)?$", lambda m: f"⟪{tab}On⟫{dot[0]}⟪/⟫</span>" + (m[1] or ""), sp)
        if k != 1:
            raise SystemExit(f"nav phone: tab {tab} has no end")
        out.append(sp)
    nav = head.replace("<nav ", '<nav aria-label="⟦p.label⟧" data-testid="nav-phone" ', 1) + "".join(out)
    flags = "".join(f"  const {t}On = p.active === \"{t}\";\n" for t in tabs)
    jsx = to_jsx(nav, names)
    for t in tabs:
        jsx = jsx.replace("{p." + t + "On && (", "{" + t + "On && (")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{BASE_FILE} screen {FEED_SCREEN} (the <nav>) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n"
            "import type { NavTab } from \"./nav-laptop.gen\";\n\n"
            "export function NavPhone(p: { active: NavTab; onSelect: (tab: NavTab) => void; label: string; "
            "labels: Record<\"feed\" | \"tables\" | \"chats\" | \"me\", string> }) {\n"
            "  const go = (tab: NavTab) => () => p.onSelect(tab);  // no arrow in a slot: its > would end the tag\n"
            f"{flags}  return (\n    {jsx}\n  );\n}}\n")


def render_feed_states(names) -> str:
    """The feed's quiet (41) and no-connection (42) blocks: the same at all three widths (checked here). The words come from the app.
    42's «We'll also try again by ourselves» is left out: the app does not promise it (brief)."""
    rx = r'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 18px 70px">[\s\S]*?(?=</div></div></div>)'
    def block(n):
        got = {re.search(rx, blocks(src)[n - 1])[0] if re.search(rx, blocks(src)[n - 1]) else None for src in (BASE_FILE, "kypros-tablet.html", "kypros-laptop.html")}
        if len(got) != 1 or None in got:
            raise SystemExit(f"feed states: screen {n} differs over the widths or has no block")
        return got.pop() + "</div></div>"
    def with_slot(src):
        return ad_splice(re.search(rx, blocks(src)[40])[0] + "</div></div>", re.search(rx, blocks(src)[261])[0] + "</div></div></div>", f"feed quiet {src} 262")
    slotted = {with_slot(src) for src in (BASE_FILE, "kypros-tablet.html", "kypros-laptop.html")}
    if len(slotted) != 1:
        raise SystemExit("feed states: 262 differs over the widths")
    def apply(b, subs, what):
        for sub, rep in subs:
            b, k = re.subn(sub, rep, b)
            if k != 1:
                raise SystemExit(f"feed states: {what}: {sub} matched {k}")
        return b
    press = lambda on, tid: f'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.{on}⟧" data-testid="{tid}" class='
    quiet = apply(slotted.pop(), [
        (r'<div style="flex:1;', '<div data-testid="quiet" style="flex:1;'),
        (r'>Quiet around here<', '>⟦p.title⟧<'),
        (r'">No phrases within 1 km right now\.<br>Yours can be the first one\.<', ';white-space:pre-line">⟦p.body⟧<'),
        (r'<span class="cta rise btn"', '⟪onSay⟫' + press("onSay", "quiet-say") + '"cta rise btn"'),
        (r'Say the first phrase</span>', '⟦p.sayLabel⟧</span>⟪/⟫'),
        (r'<span class="btn rise"', '⟪onWider⟫' + press("onWider", "wider") + '"btn rise"'),
        (r'Look further · 3 km</span>', '⟦p.widerLabel⟧</span>⟪/⟫'),
    ], "41")
    off = apply(block(42), [
        (r'<div style="flex:1;', '<div data-testid="error" style="flex:1;'),
        (r'<p style="margin:0;', '<p role="alert" style="margin:0;'),
        (r'>No connection<', '>⟦p.title⟧<'),
        (r'>Phrases will show up<br>when you’re back online\.<', '>⟦p.body⟧<'),
        (r'<span style="font:500 13px/1\.25 Golos Text,serif;color:#6f685d;">We’ll also try again by ourselves\.</span>', ''),
        (r'<span class="cta rise btn"', press("onRetry", "retry") + '"cta rise btn"'),
        (r'Try again</span>', '⟦p.retryLabel⟧</span>'),
    ], "42")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{BASE_FILE} screens 41, 42 (the same at 820 and 1440) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent } from \"react\";\n\n"
            "export function FeedQuiet(p: { title: string; body: string; sayLabel?: string; onSay?: () => void; widerLabel?: string; onWider?: () => void; ad?: " + AD_TYPE + " }) {\n"
            f"  return (\n    {to_jsx(quiet, names)}\n  );\n}}\n\n"
            "export function FeedOffline(p: { title: string; body: string; retryLabel: string; onRetry: () => void }) {\n"
            f"  return (\n    {to_jsx(off, names)}\n  );\n}}\n")


def render_table_row(names) -> str:
    """A table nearby as screen 79 draws it (its «Durak» row): the same structure at all three widths (checked here).
    The app gives the game's face, the name, the line under it, who sits, and the word on the button."""
    rx = r'<div class="rise" style="--d:2;display:flex;align-items:center;gap:14px;height:72px[\s\S]*?>sit</span></div></div>'
    norm = lambda b: re.sub(r"<svg[\s\S]*?</svg>", "<S/>", b)
    rows = {}
    for src in (BASE_FILE, "kypros-tablet.html", "kypros-laptop.html"):
        m = re.search(rx, blocks(src)[78])
        if not m:
            raise SystemExit(f"table row: {src} screen 79 has no row")
        rows[src] = m[0]
    if len({norm(r) for r in rows.values()}) != 1:
        raise SystemExit("table row: the widths draw different rows; one file no longer serves them")
    row = rows[BASE_FILE]
    pips = re.search(r'<span style="display:flex;gap:4px">([\s\S]*?)</span>', row)
    dots = re.findall(r"<i [^>]*></i>", pips[1])
    if len(set(dots)) != 2:
        raise SystemExit(f"table row: {len(set(dots))} kinds of seat dot, expected taken and free")
    row = row.replace(pips[1], "⟦pips⟧")
    for sub, rep in [
        (r'^<div class="rise" style="', '<div role="button" tabIndex="⟦0⟧" onClick="⟦p.onOpen⟧" aria-disabled="⟦p.onOpen ? undefined : true⟧" aria-label="⟦p.seatsLabel⟧" data-testid="table-open" class="rise btn" style="'),
        (r"<svg[\s\S]*?</svg>", "⟦p.face⟧"),
        (r">Durak<", ">⟦p.title⟧<"),
        (r">450 m · 3 of 4<", ">⟦p.meta⟧<"),
        # the whole row is the button (role, name, keys above); the pill inside only shows the word
        (r'<span class="btn" style="height:34px', '<span aria-hidden="true" class="btn" style="height:34px'),
        (r">sit<", ">⟦p.sitLabel⟧<"),
    ]:
        row, k = re.subn(sub, rep, row, count=1)
        if k != 1:
            raise SystemExit(f"table row: {sub} matched {k}")
    taken, free = (dots[0], next(d for d in dots if d != dots[0]))
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{BASE_FILE} screen 79 (a row of «open nearby», the same at 820 and 1440) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"const SeatTaken = () => {to_jsx(taken, names)};\n"
            f"const SeatFree = () => {to_jsx(free, names)};\n\n"
            "export function TableNearby(p: { face: ReactNode; title: string; meta: string; seats: boolean[]; seatsLabel: string; sitLabel: string; onOpen?: () => void }) {\n"
            "  const pips = p.seats.map(function (on, i) { return on ? <SeatTaken key={i} /> : <SeatFree key={i} />; });\n"
            f"  return (\n    {to_jsx(row, names)}\n  );\n}}\n")


def render_tables_head(names) -> str:
    """Screen 79's head row and strip: the same at all three widths (checked here). The archive draws six game chips, the app has more:
    one chip is generated and the strip scrolls. The pressed chip takes the lit «All» colors."""
    rx = r'<div style="display:flex;gap:8px;align-items:center">[\s\S]*?(?=<div class="rise")'
    got = {re.search(rx, blocks(src)[78])[0] if re.search(rx, blocks(src)[78]) else None for src in (BASE_FILE, "kypros-tablet.html", "kypros-laptop.html")}
    if len(got) != 1 or None in got:
        raise SystemExit("tables head: the widths differ or there is no head")
    b = got.pop()
    cut = b.index('<div style="display:flex;gap:6px;overflow:hidden">')
    row, strip = b[:cut], b[cut:]
    for sub, rep in [
        (r">Molos<", ' data-testid="tables-where">⟦p.name⟧<'),
        (r">· 1 km<", ">⟦p.sub⟧<"),
        (r'<span aria-label="New table" class="btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onNew⟧" aria-label="⟦p.newLabel⟧" data-testid="new-table" class="btn"'),
        (r'<span class="btn" aria-label="How this screen works"', '⟪help⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.help⟧" aria-label="⟦p.helpLabel⟧" data-testid="tables-help" class="btn"'),
        (r">\?</span></div>$", ">?</span>⟪/⟫</div>"),
    ]:
        row, k = re.subn(sub, rep, row)
        if k != 1:
            raise SystemExit(f"tables head: {sub} matched {k}")
    lit = re.search(r'<span class="btn" style="([^"]*)">All</span>', strip)
    idle = re.search(r'<span class="btn" style="([^"]*)">Mine</span>', strip)
    chip = re.search(r'<span class="btn" aria-label="Tavli" style="([^"]*)">(<svg[\s\S]*?</svg>)</span>', strip)
    if not (lit and idle and chip):
        raise SystemExit("tables head: the strip's All, Mine or game chip is not found")
    svg_tag = re.match(r"<svg[^>]*>", chip[2])[0]
    color = re.search(r'stroke="(#[0-9a-f]+)"', chip[2])[1]
    bg, fg = re.search(r"background:([^;]+);color:([^;]+)", lit[1]).groups()
    lit_tag = f'<span class="btn" style="{lit[1]}">'
    paint = lambda t, prop, v: json.dumps(names.resolve(t, prop, v) if isinstance(names, Names) else colorize(v, names), ensure_ascii=False)
    pill = lambda on, tid, text: (f'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.{on}⟧" aria-pressed="⟦p.{tid}On⟧" data-testid="tables-tab-{tid}" class="btn" '
                                  f'style="⟦p.{tid}On ? LIT : IDLE⟧">⟦p.{text}⟧</span>')
    bar = ('<div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;flex:none" data-testid="tables-strip">'
           + pill("onAll", "all", "allLabel") + "⟪onMine⟫" + pill("onMine", "mine", "mineLabel") + "⟪/⟫⟦p.games⟧</div>")
    style_of = lambda st: to_jsx(f'<i style="{st}"></i>', names).split("style=", 1)[1].rsplit("/>", 1)[0].rsplit("></i>", 1)[0].strip()[1:-1]
    chipjsx = to_jsx(f'<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onPress⟧" aria-label="⟦p.label⟧" aria-pressed="⟦p.on⟧" data-testid="⟦p.testid⟧" class="btn" '
                     f'style="⟦p.on ? CHIP_ON : CHIP_OFF⟧">⟦p.icon⟧</span>', names)
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{BASE_FILE} screen 79 (head row and strip, the same at 820 and 1440) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            f"const LIT: CSSProperties = {style_of(lit[1])};\nconst IDLE: CSSProperties = {style_of(idle[1])};\n"
            f"const CHIP_OFF: CSSProperties = {{ ...{style_of(chip[1])}, color: {paint(svg_tag, "stroke", color)} }};\n"
            f"const CHIP_ON: CSSProperties = {{ ...CHIP_OFF, background: {paint(lit_tag, "background", bg)}, boxShadow: \"none\", color: {paint(lit_tag, "color", fg)} }};\n\n"
            "export function GameChip(p: { label: string; on: boolean; onPress: () => void; icon: ReactNode; testid: string }) {\n"
            f"  return (\n    {chipjsx}\n  );\n}}\n\n"
            "export function TablesHead(p: { name: string; sub: string; newLabel: string; onNew: () => void; help?: () => void; helpLabel?: string }) {\n"
            f"  return (\n    {to_jsx(row, names)}\n  );\n}}\n\n"
            "export function TablesStrip(p: { allLabel: string; allOn: boolean; onAll: () => void; mineLabel: string; mineOn: boolean; onMine?: () => void; games: ReactNode }) {\n"
            f"  return (\n    {to_jsx(bar, names)}\n  );\n}}\n")


def render_feed_head(names) -> str:
    """The feed's head row of screen 283: the place pill, «Liked», «?». The archive draws it the same at all three widths
    (checked here), so one file serves them. The app's search and menu, which this row does not draw, go in p.extra."""
    rx = r'<div style="display:flex;gap:8px;align-items:center"><span data-coach="place"[\s\S]*?>\?</span></div>'
    rows = {}
    for src in (BASE_FILE, "kypros-tablet.html", "kypros-laptop.html"):
        m = re.search(rx, blocks(src)[FEED_SCREEN - 1])
        if not m:
            raise SystemExit(f"feed head: {src} has no head row")
        rows[src] = m[0]
    if len(set(rows.values())) != 1:
        raise SystemExit("feed head: the widths draw different rows; one file no longer serves them")
    row = rows[BASE_FILE]
    for sub, rep in [
        (r'<span data-coach="place" style="', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onPlace⟧" aria-label="⟦p.placeLabel⟧" data-testid="radius-open" data-coach="place" class="btn" style="'),
        (r'>Molos<', ' data-testid="feed-where">⟦p.name⟧<'),
        (r'>· 1 km<', '>⟦p.sub⟧<'),
        (r'<span aria-label="Liked" class="btn"', '<span role="button" tabIndex="⟦0⟧" onClick="⟦p.onLiked⟧" aria-label="⟦p.likedLabel⟧" aria-pressed="⟦p.likedOn⟧" data-testid="seg-likes" class="btn"'),
        (r'<span class="btn" aria-label="How this screen works"', '⟦p.extra⟧⟪help⟫<span role="button" tabIndex="⟦0⟧" onClick="⟦p.help⟧" aria-label="⟦p.helpLabel⟧" data-testid="feed-help" class="btn"'),
        (r'>\?</span></div>$', '>?</span>⟪/⟫</div>'),
    ]:
        row, k = re.subn(sub, rep, row)
        if k != 1:
            raise SystemExit(f"feed head: {sub} matched {k}")
    return (f"// generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/{BASE_FILE} screen {FEED_SCREEN} (the head row, the same at 820 and 1440) by "
            "scripts/design/nd4-extract.py; do not edit\n"
            "import type { CSSProperties, KeyboardEvent, ReactNode } from \"react\";\n\n"
            "export function FeedHead(p: { name: string; sub: string; placeLabel: string; onPlace: () => void; likedLabel: string; likedOn: boolean; onLiked: () => void; "
            "extra?: ReactNode; help?: () => void; helpLabel?: string }) {\n"
            f"  return (\n    {to_jsx(row, names)}\n  );\n}}\n")


def bare_frame_css() -> str:
    """A screen with no nav in the archive (14 loading): its frame is the whole window, at every width."""
    return ("/* the phrase's card (51, 52) at the tablet: over the feed, the rail and the pane as the tablet's frame has them */\n"
            "main[data-screen=\"card\"][data-width=\"tablet\"] > .nd-nav-tablet { position: absolute; z-index: 3; left: 16px; top: 16px; bottom: 16px; width: 80px; display: flex; }\n"
            "main[data-screen=\"card\"][data-width=\"tablet\"] > .nd-nav-tablet > nav { flex: 1; min-height: 0; }\n"
            "main[data-screen=\"card\"][data-width=\"tablet\"] > .scr { position: absolute !important; left: 112px; top: 16px; right: 16px; bottom: 16px; height: auto !important; }\n"
            "/* a screen the archive draws with no nav (14 loading): the frame is the window */\n"
            "main.nd-screen[data-bare] { position: relative; height: 100dvh; }\n"
            "main.nd-screen[data-bare] > .scr { position: absolute !important; inset: 0; width: auto !important; height: auto !important; }\n"
            "/* such a screen shown over the app (15 update: a dialog) stays over everything */\n"
            "main.nd-screen[data-bare][role=\"dialog\"] { position: fixed; inset: 0; z-index: 50; height: auto; }\n"
            "/* one's own phrase (37) stands in place of the feed; the archive draws no talks pane beside it, so it covers the app's */\n"
            "main.nd-screen[data-screen=\"my-phrase\"] { position: fixed; inset: 0; z-index: 40; height: auto; background: var(--kit-scr-bg); }\n"
            "/* the same for the screens drawn alone over the app: 38, 39, 63 */\n"
            "main.nd-screen:is([data-screen=\"phrase-rejected\"], [data-screen=\"phrase-faded\"], [data-screen=\"offer\"]) { position: fixed; inset: 0; z-index: 40; height: auto; background: var(--kit-scr-bg); }\n"
            "/* screen 63 at the laptop (png/laptop-kypros-day/063-offer-exit): the nav stays, the screen takes the area beside it */\n"
            "main.nd-screen[data-width=\"laptop\"][data-screen=\"offer\"] { left: var(--panel-left); }\n"
            "main.nd-screen[data-width=\"laptop\"][data-screen=\"offer\"] > .scr { left: 0; }\n"
            "/* the toast's bar (46): a frozen 64% in the archive, here it runs out with the undo time */\n"
            "@keyframes nd4-undo-run { from { transform: scaleX(1); } to { transform: scaleX(0); } }\n")


def place_step_css(names) -> str:
    """The lit chip of screen 22 (1 km): its background and color, given to the chip the app lights."""
    m = re.search(r'<span class="btn" style="flex:1;height:44px;[^"]*?background:([^;"]+);color:([^;"]+)">1 km<', blocks(BASE_FILE)[21])
    if not m:
        raise SystemExit("place: the lit chip is not found")
    return ('/* screen 22: the lit radius chip, from the archive\'s 1 km chip */\n'
            f'.nd-place [data-testid="place-step"][data-on] {{ background: {colorize(m[1], names)} !important; color: {colorize(m[2], names)} !important; box-shadow: none !important; }}\n')


def nav_frame_css() -> str:
    """The laptop's frame read off the archive: the screen's inset from the window, the gap, the nav's width."""
    b = blocks(NAV_SRC)[NAV_SCREEN - 1]
    frame = re.search(r'<div style="position:absolute;left:(\d+)px;right:\d+px;top:\d+px;bottom:\d+px;display:flex;gap:(\d+)px">\s*<nav style="width:(\d+)px', b)
    if not frame:
        raise SystemExit("nav: the laptop's frame (inset, gap, nav width) is not found")
    inset, gap, width = frame.groups()
    if inset != gap:
        raise SystemExit(f"nav: inset {inset} and gap {gap} differ; tokens/wide.css has one --nd-gap for both")
    return ("/* the laptop's frame (kypros-laptop.html screen 23): the rail's place of tokens/wide.css takes the archive's sizes */\n"
            f"@media (min-width: 1440px) {{\n  :root:root {{ --rail-w: {width}px; --nd-gap: {gap}px; }}\n"
            "  .tabbar.nd-nav-laptop { display: flex; padding: 0; background: none; box-shadow: none; }\n"
            "  .tabbar.nd-nav-laptop > nav { flex: 1; min-height: 0; }\n"
            "  /* a screen drawn whole from the laptop file (place-map-laptop): the nav at the window's left, the screen beside it,\n"
            "     as the archive's frame has them (the window's inset, the nav, the gap) */\n"
            "  main.nd-screen[data-width=\"laptop\"] { position: relative; height: 100dvh; }\n"
            "  /* the archive's nav stands in a row and is stretched to the frame's height (its own style says flex:none); the\n"
            "     phone's bar rule (tokens/kit.css .tabbar:not(.k-col > .tabbar): left/right/bottom 8) is not the laptop's frame */\n"
            "  main.nd-screen[data-width=\"laptop\"] > .tabbar { left: var(--nd-gap); right: auto; top: var(--nd-gap); bottom: var(--nd-gap);"
            " flex-direction: row; align-items: stretch; }\n"
            "  main.nd-screen[data-width=\"laptop\"] > .scr { position: absolute !important; left: var(--panel-left); top: var(--nd-gap);"
            " right: var(--nd-gap); bottom: var(--nd-gap); width: auto !important; height: auto !important; }\n}\n")


def render_css(table, names) -> str:
    lines = ["/* generated from docs/newdesign4/kit/sosed-design-2026-10-29/screens/*-phone.html by "
             "scripts/design/nd4-extract.py; do not edit */"]
    s = (SCREENS / BASE_FILE).read_text(encoding="utf-8")
    style = s[s.find("<style>") + 7: s.find("</style>")]
    rules = re.sub(r"@font-face\{[^}]*\}", "", style)  # the fonts are nd4-fonts.gen.css
    # the sheet's page, not a screen; every line, not only the first (panel 31.10, R4: p{margin:0} reached old screens)
    rules = re.sub(r"(?:(?<=\})|^)\s*(?:\*|p|body|h2|\.board|\.lab)\{[^}]*\}", "", rules, flags=re.M)
    # the press shrink belongs to the archive's buttons: inside its screens and the laptop nav, not the old screens'
    rules, k = re.subn(r"\.cta:active,\.btn:active\{", ":where(.scr,.nd-nav-laptop,.nd-nav-tablet) :is(.cta,.btn):active{", rules)
    if k != 1:
        raise SystemExit("kit css: the press rule .cta:active,.btn:active is not found once")

    # the kit selects by the style text ([style*="position:absolute"]); React writes a style as «prop: value;», with a
    # space, so each such selector is written the way React renders it (else .wideapp[data-form] never matched)
    rules = re.sub(r'\[style\*="([\w-]+):([^"]*)"\]', r'[style*="\1: \2"]', rules)
    lines.append(rules.strip())
    lines.append(live_map_rules(names))
    for (theme, time) in theme_files():
        decl = []
        for c, var in sorted(names.items()):
            if not var.startswith("var(--kit-"):
                continue
            v = table.get(c, {}).get((theme, time))
            if v:
                decl.append(f"  {var[4:].split(',')[0]}: {v};")
        for token, per in sorted(getattr(names, "extra", {}).items()):
            decl.append(f"  {token}: {per[(theme, time)]};")
        decl.append(f"  --kit-scr-bg: {scr_background(theme_files()[(theme, time)])};")
        lines.append(f':root[data-theme="{theme}"][data-time="{time}"] {{\n' + "\n".join(decl) + "\n}")
    return "\n".join(lines) + "\n"


# The archive draws the map as a still svg; the app's map is live (Place.tsx PlaceMap: .k-map-*). Its look is the
# archive's: each drawn element of screens 23 (ring, pin, city) and 24 (sea, land) gives the rule of its class.
LIVE = [  # (screen, regex of the archive element, selector)
    # the live map takes the place of the archive's svg: its box (absolute, inset 0, full size) is the svg's style
    (23, r'<svg viewBox="0 0 360 440" preserveAspectRatio="[^"]*" style="([^"]+)"', ".nd-place-map .k-map", "{1};border-radius:0"),
    (23, r'<rect width="360" height="440" fill="([^"]+)"', ".nd-place-map .k-map", "background:{1}"),
    (23, r'<circle cx="180\.0" cy="220\.0" r="112\.5" fill="([^"]+)" fill-opacity="([^"]+)" stroke="([^"]+)" stroke-width="([^"]+)"',
     ".nd-place-map .k-map-ring", "fill:{1};fill-opacity:{2};stroke:{3};stroke-width:{4}px;stroke-dasharray:none"),
    (23, r'<circle cx="180\.0" cy="220\.0" r="14" fill="([^"]+)" stroke="([^"]+)" stroke-width="([^"]+)"',
     ".nd-place-map .k-map-pin", "fill:{1};stroke:{2};stroke-width:{3}px"),
    (23, r'<circle cx="180\.0" cy="220\.0" r="4" fill="([^"]+)"', ".nd-place-map .k-map-pin-dot", "fill:{1}"),
    (23, r'<circle cx="[\d.]+" cy="[\d.]+" r="3" fill="([^"]+)" fill-opacity="([^"]+)"', ".nd-place-map .k-map-city circle", "fill:{1};fill-opacity:{2}"),
    (23, r'<text [^>]*font-size="([^"]+)" font-weight="([^"]+)" fill="([^"]+)" font-family="([^"]+)"',
     ".nd-place-map .k-map-city", "font:{2} {1}px {4};fill:{3}"),
    (24, r'<rect width="360" height="440" fill="([^"]+)"', ".nd-place-map .k-map[data-sea], .nd-place-map .k-map-sea", "background:{1}"),
    (24, r'<path d="M-?[\d.]+ [^"]*" fill="([^"]+)"', ".nd-place-map .k-map-land", "fill:{1}"),
]


def css_value(v: str) -> str:
    """An archive value written into a css rule: it may not end the rule (a declaration list is fine), import, or pull a remote url (security lens 01.11)."""
    if re.search(r"[{}]|@import|url\((?!\s*['\"]?data:)", v, re.I):
        raise SystemExit(f"live map: unsafe css value from the archive: {v[:60]!r}")
    return v


def live_map_rules(names) -> str:
    out = []
    for n, rx, sel, decl in LIVE:
        m = re.search(rx, blocks(BASE_FILE)[n - 1])
        if not m:
            raise SystemExit(f"live map: screen {n} has no element for {sel}")
        vals = [colorize(css_value(g), names) for g in m.groups()]
        out.append(sel + " { " + decl.format(None, *vals).replace(";", "; ") + "; }")
        if not any(norm(g) == norm(ACCENT) for g in m.groups()):
            # a fill like color-mix(…, #1d1530) at night is not one color: take it whole from each theme's file, and a
            # color one token cannot hold (panel 02.11) too; the accent stays the one variable
            for (theme, time), f in theme_files().items():
                mm = re.search(rx, blocks(f)[n - 1])
                if mm:
                    out.append(f':root[data-theme="{theme}"][data-time="{time}"] {sel.replace(", ", f", :root[data-theme=\"{theme}\"][data-time=\"{time}\"] ")} {{ '
                               + decl.format(None, *map(css_value, mm.groups())).replace(";", "; ") + "; }")
    # not in the archive (a still picture has no focus): the slider is an invisible input over the track, so its
    # keyboard focus is shown on the track (correctness lens 31.10)
    out.append('.nd-place-map input[type="range"]:focus-visible ~ div:first-of-type { outline: 2px solid var(--accent); outline-offset: 8px; }')
    return "\n".join(out)



def scr_background(f: str) -> str:
    m = re.match(r'<div class="scr" style="[^"]*?background:([^"]*)"', blocks(f)[22])
    if not m:
        raise SystemExit(f"{f}: screen 23 has no background")
    return m[1].replace("'", '"')


def all_names(nums: list[int]) -> Names:
    """The colors of every width: a screen is generated from its width's file, so its colors are read there too."""
    device_nums = [("phone", nums), ("tablet", nums), ("laptop", nums)]
    table: dict = {}
    for device, ns in device_nums:
        for c, per in color_table(ns, device).items():
            table.setdefault(c, per)
    known = known_tokens()
    return Names(token_names(table, known), table, known, device_nums)


# A zone's families live in a file of their own (owner /go 06.11: zones wired in parallel, one file each): every
# scripts/design/nd4-families/<zone>.py runs with this module's names and adds to FAMILIES, as the blocks above do.
FAMILY_DIR = Path(__file__).resolve().parent / "nd4-families"
for _f in sorted(FAMILY_DIR.glob("*.py")):
    exec(compile(_f.read_text(encoding="utf-8"), str(_f), "exec"), globals())

RAW_DIR = OUT_DIR.parent / "raw"
RAW_FILES = (("phone", BASE_FILE), ("tablet", "kypros-tablet.html"), ("laptop", "kypros-laptop.html"))


def raw_ids() -> dict[int, str]:
    """Every archive screen's number and id (docs/newdesign4/inventory.csv): the raw pass draws all 283 (owner /go 06.11)."""
    import csv
    with open(ROOT / "docs/newdesign4/inventory.csv", encoding="utf-8") as f:
        return {int(r["n"]): re.sub(r"[^a-z0-9-]", "-", r["id"].lower()) for r in csv.DictReader(f) if r["n"]}  # the "moved" rows name old screens, not archive ones


def build() -> dict[Path, str]:
    nums = sorted(set(raw_ids()) | {n for f in FAMILIES.values() for n in [f["base"], *f.get("optional", {})]} | {FEED_SCREEN, 115, 116, 117, 122, 121, 113, 109, 108, 36, 40, 44, 46, 49, 50, 51, 52, 53, 8, 54, 59, 79, 92, 124, 261, 262, 263, 267, 271})
    names = all_names(nums)
    table = names.table
    out = {}  # the css last: rendering the screens is what names their tokens
    for name, fam in FAMILIES.items():
        out[OUT_DIR / f"{name}.gen.tsx"] = render(name, fam, names)
        for width, src in fam.get("widths", {}).items():
            out[OUT_DIR / f"{name}-{width}.gen.tsx"] = render(name, fam, names, src, width)
    out[OUT_DIR.parent / "nav-laptop.gen.tsx"] = render_nav(names)
    out[OUT_DIR.parent / "nav-tablet.gen.tsx"] = render_nav_tablet(names)
    out[OUT_DIR.parent / "nav-phone.gen.tsx"] = render_nav_phone(names)
    out[OUT_DIR / "feed-states.gen.tsx"] = render_feed_states(names)
    out[OUT_DIR / "table-nearby.gen.tsx"] = render_table_row(names)
    out[OUT_DIR / "tables-head.gen.tsx"] = render_tables_head(names)
    out[OUT_DIR / "place-row.gen.tsx"] = render_place_row(names)
    out[OUT_DIR / "feed-tile.gen.tsx"] = render_feed_tile(names)
    out[OUT_DIR / "feed-head.gen.tsx"] = render_feed_head(names)
    out[OUT_DIR / "feed-own.gen.tsx"] = render_feed_own(names)
    for width, src in (("tablet", "kypros-tablet.html"), ("laptop", "kypros-laptop.html")):
        out[OUT_DIR / f"feed-own-{width}.gen.tsx"] = render_feed_own(names, src, width)
    out[OUT_DIR / "empty-panel.gen.tsx"] = render_empty_panel(names)
    out[OUT_DIR / "feed-hidden.gen.tsx"] = render_feed_hidden(names)
    out[OUT_DIR / "my-marks.gen.tsx"] = render_my_marks(names)
    out[OUT_DIR / "my-marks-empty.gen.tsx"] = render_my_marks_empty(names)
    out[OUT_DIR / "ad.gen.tsx"] = render_ad(names)
    out[OUT_DIR / "card-in.gen.tsx"] = render_card_in(names)
    out[OUT_DIR / "card-both.gen.tsx"] = render_card_both(names)
    out[OUT_DIR / "offer-card.gen.tsx"] = render_offer_card(names)
    out[OUT_DIR / "card-need.gen.tsx"] = render_card_need(names)
    out[OUT_DIR / "card-more.gen.tsx"] = render_card_more(names)
    out[OUT_DIR / "confirm.gen.tsx"] = render_confirm(names)
    out[OUT_DIR / "feed-loading.gen.tsx"] = render_feed_loading(names)
    out[OUT_DIR / "chat-ended.gen.tsx"] = render_chat_ended(names)
    out[OUT_DIR / "safety.gen.tsx"] = render_safety(names)
    out[OUT_DIR / "chat-parts.gen.tsx"] = render_chat_parts(names)
    out[OUT_DIR / "talks-empty.gen.tsx"] = render_talks_empty(names)
    out[OUT_DIR / "talks-list.gen.tsx"] = render_talks_list(names)
    out[OUT_DIR.parent / "chat-tablet.gen.tsx"] = render_chat_tablet(names)
    for width, src in (("tablet", "kypros-tablet.html"), ("laptop", "kypros-laptop.html")):
        out[OUT_DIR / f"feed-loading-{width}.gen.tsx"] = render_feed_loading(names, src, width)
        out[OUT_DIR / f"chat-ended-{width}.gen.tsx"] = render_chat_ended(names, src, width)
    for width, src in (("tablet", "kypros-tablet.html"), ("laptop", "kypros-laptop.html")):
        out[OUT_DIR / f"feed-tile-{width}.gen.tsx"] = render_feed_tile(names, src, width)
    # the raw pass (owner /go 06.11): every archive screen at every width as is, no data, no moves; a family wires it later
    for n, sid in sorted(raw_ids().items()):
        for width, src in RAW_FILES:
            # the archive's inline <script> (press hops, vibrate) is no JSX: dropped here, a family carries it as code
            sfx = "" if width == "phone" else width
            fam = {"base": n, "props": "{}", "sub": [*_FRAME, (r"<script>[\s\S]*?</script>", "")],
                   "width_skip": {sfx: {len(_FRAME)}}}
            # no data yet: the props are unused until a family wires the screen
            out[RAW_DIR / f"s{n:03d}-{sid}-{width}.gen.tsx"] = render(f"raw-{n:03d}-{width}", fam, names, src, sfx).replace("(p: {})", "(_p: {})", 1)
    for name in sorted(TEXTS):  # the archive's words of a texts-mode family: the app's translation is keyed by them
        out[OUT_DIR.parent / "texts" / f"{name}.en.json"] = json.dumps(sorted(TEXTS[name]), ensure_ascii=False, indent=1) + "\n"
    for width, src in FAMILIES["place"]["widths"].items():
        out[OUT_DIR / f"place-row-{width}.gen.tsx"] = render_place_row(names, src, width)
    # a file's order is irrelevant to --check; the css goes last because the screens above name their tokens
    out[OUT_CSS] = render_css(table, names) + nav_frame_css() + nav_tablet_frame_css() + bare_frame_css() + place_step_css(names) + sheet_layer_css() + confirm_css()
    return out


def orphans(files) -> list[str]:
    """A .gen.tsx on disk under the generator's folder that it no longer writes: a screen frozen with old colors."""
    return sorted(str(p.relative_to(ROOT)) for p in OUT_DIR.parent.rglob("*.gen.tsx") if p not in files)


def main() -> int:
    if "--colors" in sys.argv:  # the places one color cannot be told apart, and what a theme's file does not draw
        names = all_names(sorted({n for f in FAMILIES.values() for n in [f["base"], *f.get("optional", {})]} | {FEED_SCREEN, 115, 116, 117, 122, 121, 113, 109, 108, 36, 40, 44, 46, 49, 50, 51, 52, 53, 8, 54, 59, 79, 92, 124, 261, 262, 263, 267, 271}))
        print(f"minority {len(names.minority)}"); print("\n".join(names.minority))
        print(f"missing {len(names.missing)}"); print("\n".join(names.missing))
        return 0
    files = build()
    if "--list" in sys.argv:  # the files this generator owns: check-app exempts exactly these from the px gate
        print("\n".join(str(p.relative_to(ROOT)) for p in files if p.suffix == ".tsx"))
        return 0
    if "--check" in sys.argv:
        bad = [str(p.relative_to(ROOT)) for p, t in files.items() if not p.exists() or p.read_text() != t]
        lost = orphans(files)
        if bad:
            print("differ: " + ", ".join(bad))
        if lost:
            print("orphan (no generator writes it): " + ", ".join(lost))
        if not bad and not lost:
            print("ok")
        return 1 if bad or lost else 0
    for p, t in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(t)
        print("wrote", p.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
