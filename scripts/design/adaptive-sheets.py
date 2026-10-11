# Adaptive sheets (owner 11.10.2026: phone, tablet, big screen, ultrawide; quorum chose a grid + side rail
# with a content cap). The phone sheets stay where they are (sosed-sheets.py, neighbro-sheets.py); these
# draw how the same language grows: feed at 768 / 1440 / 2560 and the splash at 768 / 1440, both brands,
# real tokens from web/themes/<brand>/light.json. Output: panel/design/adaptive-<brand>-<screen>-<w>.svg,
# rendered by scripts/render-design-mockup.sh adaptive-...
#   python3 scripts/design/adaptive-sheets.py
import json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "panel", "design")
os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)
for f in ("golos.ttf", "russo.ttf"):
    shutil.copy(os.path.join(ROOT, "scripts", "design", "fonts", f), os.path.join(OUT, "fonts", f))

# Breakpoints of the decision (quorum 11.10): below 640 the phone column as it is.
SIZES = {393: 851, 768: 1024, 1440: 900, 2560: 1440}
RAIL = 1024          # from this width the tab bar is a left rail
RAIL_W = 112
CAP = {393: 361, 768: 720, 1440: 1280, 2560: 1600}   # content cap
COLS = {"sosed": {393: 2, 768: 2, 1440: 3, 2560: 4}, "neighbro": {393: 1, 768: 2, 1440: 3, 2560: 4}}
GAP = 16

PHR = ["walking to the river, join?", "coffee at the corner bakery", "looking for a chess partner",
       "lost a ginger cat by the park", "yard: music tonight", "anyone know a good handyman",
       "free kids' bike, 16 inch", "who's up for a run at 7", "a parcel came for flat 12",
       "power cut on our side?", "board games on Friday", "the bakery has rye again",
       "looking for a dog sitter", "spare tomato seedlings", "jazz in the courtyard", "need a ladder for an hour"]

# the phrase's mode — how many are going (web.mode.* in web/src/locales/en.json)
MODES = (("one", "alone"), ("group", "with friends"), ("party", "party"))
# a venue's offer as the node serves it into the feed (feed.ts venueOffers): discount, what, conditions
OFFER = ("−15%", "Corner bakery: coffee and a croissant", "till 11:00 · 200 m")

ICON = {
    "one": '<circle cx="12" cy="8" r="3.5"/><path d="M6.5 20 C7 15.5 17 15.5 17.5 20"/>',
    "group": '<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5 C4 15 14 15 14.5 19.5 M14 15 C17.5 14.5 20.5 16 20.5 19"/>',
    "party": '<path d="M4 20 L8.5 8 L16 15.5Z"/><path d="M13 4 V6 M18 6 L16.5 7.5 M20 11 H18 M11 9 L13 7"/>',
    "feed": '<rect x="4" y="4" width="7" height="9" rx="2"/><rect x="13" y="4" width="7" height="5" rx="2"/><rect x="4" y="15" width="7" height="5" rx="2"/><rect x="13" y="11" width="7" height="9" rx="2"/>',
    "tables": '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/>',
    "chat": '<path d="M4 6.5 A2.5 2.5 0 0 1 6.5 4 H17.5 A2.5 2.5 0 0 1 20 6.5 V14 A2.5 2.5 0 0 1 17.5 16.5 H10 L6 20 V16.5 A2.5 2.5 0 0 1 4 14Z"/>',
    "me": '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20 C5.5 15.5 18.5 15.5 19.5 20"/>',
    "plus": '<path d="M12 5 V19 M5 12 H19"/>',
    "heart": '<path d="M12 20 C5.5 15.6 3 12.2 3 8.8 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 21 8.8 C21 12.2 18.5 15.6 12 20Z"/>',
    "pin": '<path d="M12 21 C7.5 15.5 6 12.5 6 9.5 A6 6 0 0 1 18 9.5 C18 12.5 16.5 15.5 12 21Z"/><circle cx="12" cy="9.5" r="2.2"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 V12 L15 14"/>',
    "eyeoff": '<path d="M3 12 C6 7 18 7 21 12 C18 17 6 17 3 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 L20 4"/>',
    "check": '<path d="M5 12.5 L10 17.5 L19 7"/>',
    "key": '<circle cx="8" cy="12" r="4"/><path d="M12 12 H20.5 M17.5 12 V15 M20 12 V14.5"/>',
    "globe": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12 H20.5 M12 3.5 C9 7 9 17 12 20.5 C15 17 15 7 12 3.5"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5"/>',
}
TABS = (("feed", "feed"), ("tables", "tables"), ("chat", "chats"), ("me", "me"))


def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;")


class Sheet:
    def __init__(self, brand, w, h, theme="light"):
        t = json.load(open(os.path.join(ROOT, "web", "themes", brand, theme + ".json")))["tokens"]
        self.k, self.brand, self.w, self.h, self.buf = t, brand, w, h, []
        self.tiles = [t["tile-1"], t["tile-2"], t["tile-3"], t["tile-4"]]
        head = "Russo One" if brand == "neighbro" else "Golos Text"
        self.head = head
        self.a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><style>'
               '@font-face{font-family:"Golos Text";font-weight:400 700;src:url(fonts/golos.ttf)}'
               '@font-face{font-family:"Russo One";src:url(fonts/russo.ttf)}</style>'
               f'<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="{t["surface-2"]}"/></pattern></defs>')
        self.a(f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>')

    def a(self, s): self.buf.append(s)

    def text(self, x, y, s, size=16, fill=None, w=400, anchor="start", head=False):
        fam = self.head if head else "Golos Text"
        self.a(f'<text x="{x}" y="{y}" font-family="{fam}" font-weight="{w}" font-size="{size}" fill="{fill or self.k["fg"]}" text-anchor="{anchor}">{esc(s)}</text>')

    def icon(self, x, y, name, col, s=1.0):
        self.a(f'<g transform="translate({x} {y}) scale({s})" fill="none" stroke="{col}" stroke-width="{1.5 / s:.2f}" '
               f'stroke-linecap="round" stroke-linejoin="round">{ICON[name]}</g>')

    def rect(self, x, y, w, h, fill, r=24, extra=""):
        self.a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" {extra}/>')

    def sticker_rect(self, x, y, w, h, fill, r=18, tilt=0):
        k = self.k
        self.a(f'<g transform="rotate({tilt} {x + w / 2} {y + h / 2})">')
        self.a(f'<rect x="{x + 1.5}" y="{y + 3}" width="{w}" height="{h}" rx="{r}" fill="{k["shadow"]}" stroke="{k["shadow"]}" stroke-width="10" stroke-linejoin="round" opacity=".9"/>')
        self.a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="#ffffff" stroke-width="7" paint-order="stroke"/>')
        self.a('</g>')

    def sticker(self, cx, cy, r, fill, name, tilt=0, ink=None):
        self.a(f'<g transform="rotate({tilt} {cx} {cy})">')
        self.a(f'<circle cx="{cx + 1.5}" cy="{cy + 3}" r="{r}" fill="{self.k["shadow"]}" stroke="{self.k["shadow"]}" stroke-width="10"/>')
        self.a(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="#ffffff" stroke-width="7" paint-order="stroke"/>')
        s = r * 1.05 / 24
        self.icon(cx - 12 * s, cy - 12 * s, name, ink or self.k["fg"], s)
        self.a('</g>')

    def label(self, x, y, s):
        # sheet annotation, outside the product's own type: dashed box + mono-ish caption
        self.a(f'<text x="{x}" y="{y}" font-family="Golos Text" font-size="14" fill="{self.k["accent-text"]}">{esc(s)}</text>')

    def measure(self, x1, x2, y, s):
        c = self.k["accent-text"]
        self.a(f'<path d="M{x1} {y} H{x2} M{x1} {y - 6} V{y + 6} M{x2} {y - 6} V{y + 6}" stroke="{c}" stroke-width="1.5" stroke-dasharray="4 4"/>')
        self.text((x1 + x2) / 2, y - 8, s, 14, c, 600, "middle")

    def save(self, name):
        self.a("</svg>")
        open(os.path.join(OUT, name + ".svg"), "w").write("\n".join(self.buf))
        print("wrote", name)


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)


# ---------- the brands' own marks (drawn for the landings; owner 11.10: use them, accent on them)
# sosed: repo sosed.place landing/index.html:319 — a bubble that is a block of flats, 2x3 windows, antenna,
#        in an accent circle. neighbro: repo neighbro.place landing/icons/icon.svg — a bubble shaped as a
#        house with a chimney and two lines. Both follow the theme accent (quorum 11.10); where accent on bg
#        is under 3:1 the mark takes a ring / fill of accent-text (>= 4.9 in every theme).
def mark(sh, cx, cy, size, ground=None, lit=6):
    k = sh.k; s = size / 96; ground = ground or k["bg"]
    x, y = cx - size / 2, cy - size / 2
    sh.a(f'<g transform="translate({x:.1f} {y:.1f}) scale({s:.4f})">')
    if sh.brand == "sosed":
        ring = cr(k["accent"], ground) < 3
        sh.a(f'<circle cx="48" cy="48" r="46" fill="{k["accent"]}"' + (f' stroke="{k["accent-text"]}" stroke-width="3"' if ring else "") + '/>')
        ink = k["fg"] if cr(k["fg"], k["accent"]) >= cr(k["accent-fg"], k["accent"]) else k["accent-fg"]
        sh.a(f'<g transform="translate(17,18) scale(0.86)"><path d="M48 6 V18 M42 8 L54 4" fill="none" stroke="{ink}" stroke-width="3" stroke-linecap="round"/>'
             f'<path d="M10 18 H62 V56 H30 L18 66 V56 H10 Z" fill="{ink}" stroke="{ink}" stroke-width="4" stroke-linejoin="round"/>')
        for i, (wx, wy) in enumerate(((17, 25), (32, 25), (47, 25), (17, 40), (32, 40), (47, 40))):
            sh.a(f'<rect x="{wx}" y="{wy}" width="8" height="8" fill="{k["accent"] if i < lit else ink}"/>')
        sh.a('</g>')
    else:
        fill = k["accent"] if cr(k["accent"], ground) >= 3 else k["accent-text"]
        house = 'M36 4 L64 28 V57 H32 L20 67 V57 H8 V28 Z'
        sh.a('<g transform="translate(6,3) scale(1.05)">')
        sh.a(f'<g transform="translate(1.5 3)"><rect x="50" y="10" width="7" height="14" rx="2" fill="{k["shadow"]}" stroke="{k["shadow"]}" stroke-width="10"/>'
             f'<path d="{house}" fill="{k["shadow"]}" stroke="{k["shadow"]}" stroke-width="14" stroke-linejoin="round"/></g>')
        die = k["surface"]   # as web/src/ui/Mark.tsx draws it: the die-cut and the lines are --surface
        sh.a(f'<rect x="50" y="10" width="7" height="14" rx="2" fill="{fill}" stroke="{die}" stroke-width="7" paint-order="stroke"/>'
             f'<path d="{house}" fill="{fill}" stroke="{die}" stroke-width="9" stroke-linejoin="round" paint-order="stroke"/>'
             f'<rect x="22" y="32" width="18" height="5" rx="2.5" fill="{die}"/><rect x="22" y="43" width="27" height="5" rx="2.5" fill="{die}"/>')
        sh.a('</g>')
    sh.a('</g>')


def wrap(s, size, maxw):
    out = [""]
    for wd in s.split():
        t = (out[-1] + " " + wd).strip()
        if len(t) * size * 0.54 > maxw and out[-1]: out.append(wd)
        else: out[-1] = t
    return out


def ink(sh, bg):
    def lum(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    def cr(a, b):
        la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
    return max((sh.k["fg"], "#ffffff", sh.k["bg"]), key=lambda c: cr(c, bg))


# ---------- chrome: rail (>=1024) or bottom tab bar
def chrome(sh, active=0):
    k, w, h = sh.k, sh.w, sh.h
    if w >= RAIL:
        if sh.brand == "sosed":
            sh.rect(16, 16, RAIL_W - 16, h - 32, k["surface"], 32, f'stroke="{k["line"]}" stroke-width="1.5"')
        else:
            sh.a(f'<rect x="0" y="0" width="{RAIL_W}" height="{h}" fill="{k["surface"]}"/><path d="M{RAIL_W} 0 V{h}" stroke="{k["surface-2"]}" stroke-width="2"/>')
        cx = 16 + (RAIL_W - 16) / 2 if sh.brand == "sosed" else RAIL_W / 2
        mark(sh, cx, 56, 44, k["surface"])
        for i, (ic, lab) in enumerate(TABS):
            y = 112 + i * 88
            if i == active:
                if sh.brand == "sosed": sh.rect(cx - 32, y, 64, 56, k["fg"], 28)
                else: sh.sticker_rect(cx - 32, y, 64, 56, k["tile-2"], 16, -3)
            col = (k["bg"] if sh.brand == "sosed" else ink(sh, k["tile-2"])) if i == active else k["fg"]
            sh.icon(cx - 12, y + 10, ic, col)
            sh.text(cx, y + 50, lab, 14, col, 600, "middle")
        # write: a primary button in the rail
        if sh.brand == "sosed": sh.rect(cx - 32, h - 120, 64, 64, k["accent"], 32)
        else: sh.sticker(cx, h - 88, 30, k["accent"], "plus", ink=k["accent-fg"])
        if sh.brand == "sosed": sh.icon(cx - 12, h - 100, "plus", k["accent-fg"])
        sh.label(cx - 40, h - 26 if sh.brand == "neighbro" else h - 34, "rail ≥1024")
        return RAIL_W + (16 if sh.brand == "sosed" else 0)
    # bottom tab bar, phone geometry, centred
    bw = min(480, w - 32)
    x0 = (w - bw) / 2
    if sh.brand == "sosed":
        sh.rect(x0, h - 80, bw, 64, k["surface"], 32, f'stroke="{k["line"]}" stroke-width="1.5"')
    else:
        sh.a(f'<rect x="0" y="{h - 80}" width="{w}" height="80" fill="{k["surface"]}"/><path d="M0 {h - 80} H{w}" stroke="{k["surface-2"]}" stroke-width="2"/>')
    for i, (ic, lab) in enumerate(TABS):
        cx = x0 + bw / 8 + i * bw / 4
        if i == active:
            if sh.brand == "sosed": sh.rect(cx - 40, h - 72, 80, 48, k["fg"], 24)
            else: sh.sticker_rect(cx - 30, h - 62, 60, 44, k["tile-2"], 14)
        col = (k["bg"] if sh.brand == "sosed" else ink(sh, k["tile-2"])) if i == active else k["fg"]
        sh.icon(cx - 12, h - 60 if sh.brand == "sosed" else h - 52, ic, col)
    sh.label(x0, h - 90, "tab bar stays at the bottom below 1024, 480 wide")
    return 0


def backdrop(sh, x0, x1):
    """The fields beside the capped content: brand ground, not empty paper."""
    # owner 11.10, 2c: smaller and sparser, only at the very edge of the screen (not beside the content)
    k, h = sh.k, sh.h
    if sh.brand == "neighbro": sh.a(f'<rect x="{sh.rail}" y="0" width="{sh.w - sh.rail}" height="{h}" fill="url(#dots)"/>')
    for side, (a, b) in enumerate(((sh.rail, x0), (x1, sh.w))):
        if b - a < 200: continue
        band = (a + 24, a + 120) if side == 0 else (b - 120, b - 24)
        for i in range(int(h / 340)):
            y = 80 + i * 340 + (side * 170)
            if y > h - 80: break
            if sh.brand == "sosed":
                sh.rect(band[0] + (i % 2) * 24, y, 64 + (i % 2) * 8, 48 + (i % 3) * 16, sh.tiles[(i + side) % 4], 14, 'opacity=".16"')
            else:
                sh.a('<g opacity=".24">'); sh.sticker(band[0] + 40 + (i % 2) * 16, y, 18 + (i % 3) * 4, sh.tiles[(i + side) % 4], ("heart", "pin", "sun", "chat")[i % 4], (-12, 8, -4, 14)[i % 4], "#ffffff"); sh.a('</g>')


# ---------- feed
def feed(brand, w):
    h = SIZES[w]
    sh = Sheet(brand, w, h)
    k = sh.k
    # the ground goes first, the chrome on top of it
    rail = (RAIL_W + (16 if brand == "sosed" else 0)) if w >= RAIL else 0
    sh.rail = rail
    avail = w - rail
    cap = min(CAP[w], avail - 48)
    x0 = rail + (avail - cap) / 2
    x1 = x0 + cap
    backdrop(sh, x0, x1)
    chrome(sh, 0)
    cols = COLS[brand][w]
    # head: below the rail the mark lives in the top bar, 32, before the title
    tx = x0
    if w < RAIL: mark(sh, x0 + 16, 54, 32); tx = x0 + 44
    sh.text(tx, 64, "Nearby" if brand == "sosed" else "nearby", 28 if brand == "sosed" else 22, w=600)
    if brand == "sosed":
        sh.rect(x0, 88, 140, 48, k["surface"], 24, f'stroke="{k["line"]}" stroke-width="1.5"'); sh.icon(x0 + 14, 100, "pin", k["fg"]); sh.text(x0 + 46, 118, "1 km", 16, w=600)
    else:
        sh.text(x0, 96, "1 km · 16 phrases", 16, k["fg-muted"])
    sh.measure(x0, x1, 150 if brand == "sosed" else 118, f"content {cap:.0f} · {cols} columns")
    top = 168 if brand == "sosed" else 140
    bottom = h - (96 if w < RAIL else 24)
    cw = (cap - GAP * (cols - 1)) / cols
    if brand == "sosed":
        # the mosaic rhythm by cells: every fifth tile spans two columns (dense flow), heights vary
        hs = (136, 180, 84, 84, 104, 180, 120, 84)
        col_y = [top] * cols
        i = 0
        while True:
            span = 2 if (i % 5 == 0 and cols >= 4) else 1   # owner 11.10, 1b: a wide tile only from 4 columns
            # dense: the lowest run of `span` columns
            best = min(range(cols - span + 1), key=lambda c: max(col_y[c:c + span]))
            y = max(col_y[best:best + span]); hh = hs[i % len(hs)]
            # room for the text and, under it, the like row (44): the mark never lies on a word
            cw_ = cw * span + GAP * (span - 1); sz_ = 20 if cw_ > 200 else 16
            narrow = cw_ < 240   # the mode gets a line of its own above the like row
            hh = max(hh, 34 + len(wrap(PHR[i % len(PHR)], sz_, cw_ - 32)[:2]) * round(sz_ * 1.35) + 44 + (28 if narrow else 0))
            if y + hh > bottom: break
            x = x0 + best * (cw + GAP); ww = cw * span + GAP * (span - 1)
            if i % 7 == 3:
                # a venue's offer in the feed (node: venueOffers, feed.ts:361): on the surface, the discount
                # in accent-text (web .ui-offer), what and until when under it
                ol = wrap(OFFER[1], 16, ww - 32)[:3]
                hh = max(hh, 74 + len(ol) * 22 + 34)
                if y + hh > bottom: break
                sh.rect(x, y, ww, hh, k["surface"], 24, f'stroke="{k["line"]}" stroke-width="1.5"')
                sh.text(x + 16, y + 44, OFFER[0], 28, k["accent-text"], 600)
                yy = y + 74
                for line in ol: sh.text(x + 16, yy, line, 16, k["fg"], 600); yy += 22
                sh.text(x + 16, y + hh - 18, OFFER[2], 14, k["fg-muted"])
                for c2 in range(best, best + span): col_y[c2] = y + hh + GAP
                i += 1
                continue
            c = sh.tiles[i % 4]; fg = ink(sh, c)
            sh.rect(x, y, ww, hh, c, 24)
            size = 20 if ww > 200 else 16
            yy = y + 34
            for line in wrap(PHR[i % len(PHR)], size, ww - 32)[:2]:
                sh.text(x + 16, yy, line, size, fg, 600 if size == 20 else 500); yy += round(size * 1.35)
            # how many: the mode, as the web prints it (brands/sosed/index.tsx:84) — icon and word
            mi, mw = MODES[i % 3]
            my = y + hh - (48 if ww < 240 else 20)
            sh.icon(x + 14, my - 18, mi, fg, 0.85); sh.text(x + 40, my, mw, 14, fg, 500)
            # the like is the mark (owner 11.10): lit where this person is in, the count beside it
            liked = i % 4 == 1
            like_btn(sh, x + ww - 58, y + hh - 26, 24, 6 if liked else 0, ink_=fg)
            sh.text(x + ww - 40, y + hh - 20, str((i * 3) % 7 + (1 if liked else 0)), 16, fg, 600)
            for c2 in range(best, best + span): col_y[c2] = y + hh + GAP
            i += 1
        fab = (x1 - 72, h - 176) if w < RAIL else None
        if fab: sh.rect(fab[0], fab[1], 72, 72, k["accent"], 36); sh.icon(fab[0] + 24, fab[1] + 24, "plus", k["accent-fg"])
    else:
        # stickers keep their size (343 on the phone); columns of sticker cards, a light tilt by column
        col_y = [top + (c % 2) * 28 for c in range(cols)]
        i = 0
        while True:
            c = min(range(cols), key=lambda q: col_y[q])
            offer = i % 5 == 2
            lines = wrap(OFFER[1] if offer else PHR[i % len(PHR)], 22, cw - 40)
            hh = 40 + len(lines) * 30 + 46 + (40 if offer else 26)
            if col_y[c] + hh > bottom: break
            x = x0 + c * (cw + GAP); tilt = (0, -1.2, 0.8, -0.6)[(i + c) % 4]
            # the whole sticker turns — its ground, its words and its like together (owner 11.10)
            sh.a(f'<g transform="rotate({tilt} {x + cw / 2:.1f} {col_y[c] + hh / 2:.1f})">')
            sh.sticker_rect(x, col_y[c], cw, hh, k["surface"], 18, 0)
            yy = col_y[c] + 44
            if offer:
                # a venue's offer: the discount as an accent tag, what under it, until when muted
                sh.sticker_rect(x + 20, col_y[c] + 18, 92, 40, k["accent"], 14, -4)
                sh.text(x + 66, col_y[c] + 46, OFFER[0], 22, k["accent-fg"], 600, "middle")
                yy += 48
            for line in lines: sh.text(x + 20, yy, line, 22, w=600); yy += 30
            if offer:
                sh.text(x + 20, yy + 14, OFFER[2], 16, k["fg-muted"])
            else:
                # how many: the mode, icon and word (web: sticker-foot, brands/neighbro/index.tsx:88)
                mi, mw = MODES[i % 3]
                sh.icon(x + 20, yy - 6, mi, k["fg-muted"], 0.75); sh.text(x + 42, yy + 10, mw, 16, k["fg-muted"])
                yy += 26
                liked = i % 4 == 1   # the like is the mark (owner 11.10)
                like_btn(sh, x + 34, yy + 12, 28, 2 if liked else 0)
                sh.text(x + 66, yy + 20, f"{(i * 3) % 7 + 1}" + (" · I'm in" if liked else ""), 16, w=600)
            sh.a('</g>')
            col_y[c] += hh + 24
            i += 1
        if w < RAIL: sh.sticker(x1 - 40, h - 136, 30, k["accent"], "plus", ink=k["accent-fg"])
        if cw > 345 and w >= 640: sh.label(x0 + 260, 64, f"sticker card {cw:.0f} wide (phone 343); text stays 22/600")
    sh.save(f"adaptive-{brand}-feed-{w}")


# ---------- splash: the brand's mark is the hero (owner 11.10; quorum: one huge mark, the rest quiet)
def splash(brand, w):
    h = SIZES[w]
    sh = Sheet(brand, w, h)
    k = sh.k
    sh.rail = 0
    poster = w >= 1440
    word = "sosed" if brand == "sosed" else "neighbro"
    if brand == "neighbro": sh.a(f'<rect width="{w}" height="{h}" fill="url(#dots)"/>')
    if poster:
        px0, px1 = 64, w / 2 - 32
        fx0 = w / 2 + (w / 2 - 440) / 2
        cx, cy, ms = (px0 + px1) / 2, h / 2 - 40, min(440, h - 300)
    else:
        fw = min(440, w - 32)
        fx0 = (w - fw) / 2
        cx, cy, ms = w / 2, 200 if w < 640 else 260, 160 if w < 640 else 200
    # the quiet supporting cast around the mark: the old tiles / stickers, small and pale
    if brand == "sosed":
        lat = [(-1.05, -0.62, 0.42, 0.30), (0.66, -0.66, 0.36, 0.22), (0.72, 0.42, 0.30, 0.36), (-1.0, 0.48, 0.34, 0.26)]
        for i, (dx, dy, ww, hh) in enumerate(lat):
            sh.rect(cx + dx * ms, cy + dy * ms, ww * ms, hh * ms, sh.tiles[i], 0.08 * ms, 'opacity=".22"')
    else:
        for i, (dx, dy, r, ic, t) in enumerate(((-0.78, -0.5, 0.11, "heart", -8), (0.74, -0.46, 0.09, "pin", 10),
                                                (0.8, 0.5, 0.1, "chat", -12), (-0.74, 0.56, 0.085, "sun", 8))):
            sh.sticker(cx + dx * ms, cy + dy * ms, r * ms, sh.tiles[(i + 1) % 4], ic, t, "#ffffff")
    mark(sh, cx, cy, ms)
    sh.text(cx, cy + ms / 2 + (88 if poster else 52), word, 72 if poster else 40, k["fg"], 600 if brand == "sosed" else 400, "middle", head=True)
    # entry: the phone's form, 440 at most
    fy = h / 2 - 150 if poster else cy + ms / 2 + 120
    big = 40 if poster else 28
    sh.text(fx0, fy, "What neighbours", big, w=600)
    sh.text(fx0, fy + big + 8, "say nearby", big, w=600)
    sh.text(fx0, fy + 2 * big + 16, "What's said fades.", 20, k["fg-muted"])
    by = fy + 2 * big + 52
    fw = 440 if (poster or w >= 640) else w - 32
    if brand == "sosed":
        sh.rect(fx0, by, fw, 64, k["accent"], 32); sh.icon(fx0 + fw / 2 - 12, by + 20, "check", k["accent-fg"])
        sh.rect(fx0, by + 76, fw, 56, "none", 28, f'stroke="{k["line"]}" stroke-width="1.5"'); sh.icon(fx0 + fw / 2 - 12, by + 92, "key", k["fg"])
    else:
        sh.sticker_rect(fx0, by, fw, 56, k["accent"], 28); sh.icon(fx0 + fw / 2 - 12, by + 16, "check", k["accent-fg"])
        sh.sticker_rect(fx0, by + 72, fw, 56, k["surface"], 28); sh.icon(fx0 + fw / 2 - 12, by + 88, "key", k["fg"])
    if poster: sh.label(px0, h - 24, f"mark {ms}px, the hero of the poster; windows / house follow the theme accent")
    else: sh.label(16, h - 16, f"mark {ms}px; enters once, still under reduced motion")
    sh.save(f"adaptive-{brand}-splash-{w}")


# ---------- the like button is the brand's mark (owner 11.10.2026: no heart; «windows light up»)
# lit: how many windows (sosed, 0..6) / lines (neighbro, 0..2) are on; lift: neighbro's knock, px up.
def like_btn(sh, cx, cy, size, lit, lift=0, ink_=None):
    k = sh.k; s = size / 96
    on = lit > 0
    sh.a(f'<g transform="translate({cx - size / 2:.1f} {cy - size / 2 - lift:.1f}) scale({s:.4f})">')
    if sh.brand == "sosed":
        # owner 11.10: not the whole logo — its outline, a line icon as thick as the letters (like the
        # heart was): the bubble-house with its antenna on the 24 grid, stroke 1.5 (here x4). At rest it
        # is empty; the tap lights its six windows one by one; liked = the windows stay lit (filled).
        col = ink_ or k["fg"]
        sh.a(f'<g fill="none" stroke="{col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M14 30 H82 V72 H42 L26 86 V72 H14 Z"/><path d="M62 30 V14 M54 16 L70 10"/></g>')
        for i, (wx, wy) in enumerate(((25, 40), (43, 40), (61, 40), (25, 55), (43, 55), (61, 55))):
            if i < lit: sh.a(f'<rect x="{wx}" y="{wy}" width="10" height="9" rx="1.5" fill="{col}"/>')
    else:
        # owner 11.10: the storefront's own logo, simply — its outline as a line icon, stroke 1.5 on the
        # 24 grid (x4 here): the house-bubble with its chimney. At rest empty; the tap knocks (a small lift)
        # and draws its two lines; liked = the lines stay.
        col = ink_ or k["fg"]
        sh.a(f'<g fill="none" stroke="{col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M48 12 L80 38 V72 H44 L28 86 V72 H16 V38 Z"/><path d="M64 25 V14 H72 V31"/></g>')
        for j, (lx, lw) in enumerate(((32, 22), (32, 34))):
            if j < lit: sh.a(f'<rect x="{lx}" y="{46 + j * 12}" width="{lw}" height="6" rx="3" fill="{col}"/>')
    sh.a('</g>')


def likes(brand):
    W, H = 1440, 900
    sh = Sheet(brand, W, H)
    k = sh.k
    if brand == "neighbro": sh.a(f'<rect width="{W}" height="{H}" fill="url(#dots)"/>')
    sh.text(48, 64, f"{brand} · the like is the mark", 28, w=600)
    sh.text(48, 96, "no heart (owner 11.10). Tap: the windows light one by one, once; liked: they stay lit — «I'm in».", 16, k["fg-muted"])
    sh.text(48, 120, "Taken back: they go dark at once. Nothing moves at rest, nothing on scroll; reduced motion: lit at once.", 16, k["fg-muted"])
    # 1. three states
    sh.text(48, 178, "1 · states (96 here, 44 on a card)", 20, w=600)
    full = 6 if brand == "sosed" else 2
    for i, (lab, lit) in enumerate((("at rest", 0), ("pressed (mid-animation)", full // 2), ("liked — «I'm in»", full))):
        x = 120 + i * 260
        like_btn(sh, x, 270, 96, lit)
        sh.text(x, 350, lab, 16, k["fg"], 600 if lit == full else 400, "middle")
    # 2. storyboard
    sh.text(48, 420, "2 · the tap, frame by frame" + (" — 6 windows, 60 ms apart, 360 ms" if brand == "sosed" else " — a knock (lift 3 px) and 2 lines, 360 ms"), 20, w=600)
    frames = range(7) if brand == "sosed" else range(5)
    for i in frames:
        x = 100 + i * 120
        if brand == "sosed": like_btn(sh, x, 510, 72, i); t = f"{i * 60} ms"
        else:
            lit, lift = ((0, 0), (0, 3), (1, 1), (2, 0), (2, 0))[i]; like_btn(sh, x, 510, 72, lit, lift); t = f"{i * 90} ms"
        sh.text(x, 572, t, 14, k["fg-muted"], 400, "middle")
    # 3. on a card (phone geometry)
    cx0 = 1000; sh.text(cx0, 178, "3 · on a phrase in the feed", 20, w=600)
    for j, (txt, lit, n) in enumerate((("walking to the river, join?", 0, 3), ("coffee at the corner bakery", full, 4))):
        y = 210 + j * 230
        if brand == "sosed": sh.rect(cx0, y, 343, 200, sh.tiles[j], 24)
        else: sh.sticker_rect(cx0, y, 343, 200, k["surface"], 18)
        fg = ink(sh, sh.tiles[j]) if brand == "sosed" else k["fg"]
        sh.text(cx0 + 20, y + 44, txt, 20, fg, 600)
        if brand == "sosed": sh.a(f'<circle cx="{cx0 + 48}" cy="{y + 152}" r="28" fill="{k["bg"]}" opacity=".0"/>')
        like_btn(sh, cx0 + 44, y + 152, 32, lit, ink_=fg)
        sh.text(cx0 + 76, y + 158, (f"{n} · I'm in" if lit else f"{n}"), 16, fg, 600)
        sh.label(cx0 + 200, y + 158, "48 target" if j == 0 else "liked")
    sh.label(48, H - 32, "the count says how many are in; the button's name for a screen reader: «I'm in» / «not in any more» (17 languages)")
    sh.save(f"adaptive-{brand}-like")


# ---------- the other screens at 1440 (owner 11.10: «draw the other screens too"): the rail on the left,
# a reading column of 640 at most for card / composer / inbox / chat / table / me, the tables a grid of 3.
ICON.update({
    "back": '<path d="M14.5 5.5 L8 12 L14.5 18.5"/>',
    "more": '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    "send": '<path d="M4 12 L20 4.5 L15 20 L11.5 13Z M11.5 13 L20 4.5"/>',
    "eye": '<path d="M3 12 C6 7 18 7 21 12 C18 17 6 17 3 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    "key": '<circle cx="8" cy="12" r="4"/><path d="M12 12 H20.5 M17.5 12 V15 M20 12 V14.5"/>',
    "device": '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18 H13"/>',
    "globe": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12 H20.5 M12 3.5 C9 7 9 17 12 20.5 C15 17 15 7 12 3.5"/>',
    "fwd": '<path d="M9.5 5.5 L16 12 L9.5 18.5"/>',
})
TAB_OF = {"card": 0, "composer": 0, "inbox": 2, "chat": 2, "tables": 1, "table": 1, "me": 3}


def frame(sh, active, title, back=False, colw=640):
    """The rail, the brand's ground, a column of colw centred right of the rail; returns its x0, x1."""
    k, w = sh.k, sh.w
    rail = RAIL_W + (16 if sh.brand == "sosed" else 0)
    sh.rail = rail
    x0 = rail + (w - rail - colw) / 2; x1 = x0 + colw
    backdrop(sh, x0, x1)
    chrome(sh, active)
    tx = x0
    if back:
        if sh.brand == "sosed": sh.rect(x0, 36, 48, 48, k["surface"], 24, f'stroke="{k["line"]}" stroke-width="1.5"')
        else: sh.sticker(x0 + 24, 60, 22, k["surface"], "back")
        if sh.brand == "sosed": sh.icon(x0 + 12, 48, "back", k["fg"])
        tx = x0 + 64
    sh.text(tx, 70, title, 28 if sh.brand == "sosed" else 22, w=600)
    sh.measure(x0, x1, 104, f"column {colw}")
    return x0, x1


def panel(sh, x, y, w, h, fill=None, r=24, tilt=0):
    k = sh.k
    if sh.brand == "sosed": sh.rect(x, y, w, h, fill or k["surface"], r, f'stroke="{k["line"]}" stroke-width="1.5"' if not fill else "")
    else: sh.sticker_rect(x, y, w, h, fill or k["surface"], 18, tilt)


def button(sh, x, y, w, label, kind="pri", icon=None):
    k = sh.k
    fill = k["accent"] if kind == "pri" else k["surface"]
    col = k["accent-fg"] if kind == "pri" else k["fg"]
    if sh.brand == "sosed": sh.rect(x, y, w, 56, fill, 28, "" if kind == "pri" else f'stroke="{k["line"]}" stroke-width="1.5"')
    else: sh.sticker_rect(x, y, w, 56, fill, 28)
    if icon: sh.icon(x + w / 2 - 12 - (len(label) * 4 if label else 0), y + 16, icon, col)
    if label: sh.text(x + w / 2 + (14 if icon else 0), y + 34, label, 16, col, 600, "middle")


def s_card(sh):
    k = sh.k
    x0, x1 = frame(sh, 0, "phrase", back=True)
    full = 6 if sh.brand == "sosed" else 2
    fill = sh.tiles[1] if sh.brand == "sosed" else k["surface"]
    fg = ink(sh, fill) if sh.brand == "sosed" else k["fg"]
    panel(sh, x0, 130, 640, 420, fill)
    yy = 210
    for line in wrap("walking to the river, who's with me? we start at the bridge", 36, 560):
        sh.text(x0 + 32, yy, line, 36, fg, 600); yy += 48
    sh.icon(x0 + 32, yy + 4, "group", fg); sh.text(x0 + 64, yy + 22, "with friends · 300 m · fades in 40 min", 16, fg)
    like_btn(sh, x0 + 56, 500, 40, full, ink_=fg); sh.text(x0 + 88, 507, "5 · I'm in", 16, fg, 600)
    if sh.brand == "sosed": sh.rect(x1 - 80, 472, 56, 56, k["surface"], 28)
    else: sh.sticker(x1 - 52, 500, 26, k["surface"], "more")
    sh.icon(x1 - 64, 488, "more", k["fg"])
    sh.label(x0, 590, "one column 640; the like is the mark, 40 here (44 target); hide / block / report under «…»")
    sh.save(f"adaptive-{sh.brand}-card-1440")


def s_composer(sh):
    k = sh.k
    x0, x1 = frame(sh, 0, "write a phrase", back=True)
    panel(sh, x0, 130, 640, 200)
    sh.text(x0 + 24, 176, "what's happening near you…", 22, k["fg-muted"])
    sh.text(x1 - 24, 310, "0 / 140", 14, k["fg-muted"], 400, "end")
    sh.text(x0, 376, "how many", 16, k["fg-muted"], 600)
    for j, (ic, lab) in enumerate(MODES):
        x = x0 + j * 214; on = j == 1
        if sh.brand == "sosed": sh.rect(x, 392, 200, 56, k["fg"] if on else k["surface"], 28, "" if on else f'stroke="{k["line"]}" stroke-width="1.5"')
        else: sh.sticker_rect(x, 392, 200, 56, sh.tiles[1] if on else k["surface"], 28, (-2, 1, -1)[j] if on else 0)
        col = (k["bg"] if sh.brand == "sosed" else ink(sh, sh.tiles[1])) if on else k["fg"]
        sh.icon(x + 24, 408, ic, col); sh.text(x + 58, 426, lab, 16, col, 600)
    sh.text(x0, 500, "fades in", 16, k["fg-muted"], 600)
    for j, lab in enumerate(("1 h", "3 h", "until tonight")):
        x = x0 + j * 214; on = j == 0
        panel(sh, x, 516, 200, 56, k["accent"] if on else None)
        sh.text(x + 100, 550, lab, 16, k["accent-fg"] if on else k["fg"], 600, "middle")
    button(sh, x0, 620, 640, "send", "pri", "send")
    sh.label(x0, 712, "one column 640; the choices in a row of three instead of a stack")
    sh.save(f"adaptive-{sh.brand}-composer-1440")


INBOX = (("Anya", "see you at the bridge in half an hour", "chat"), ("Boris", "wants to talk — 23 h left to say yes", "offer"),
         ("Lena", "thanks for the ladder!", "chat"), ("Mark", "is the yard music still on?", "chat"))


def s_inbox(sh):
    k = sh.k
    x0, x1 = frame(sh, 2, "talks")
    for j, (title, y) in enumerate((("offers", 130), ("talks", 290))):
        sh.text(x0, y + 10, title, 16, k["fg-muted"], 600)
    rows = [(INBOX[1], 150)] + [(r, 310 + n * 96) for n, r in enumerate((INBOX[0], INBOX[2], INBOX[3]))]
    for n, ((name, last, kind), y) in enumerate(rows):
        panel(sh, x0, y, 640, 84, None, tilt=(0, -0.6, 0.5, -0.4)[n] if sh.brand == "neighbro" else 0)
        if sh.brand == "sosed": sh.rect(x0 + 14, y + 14, 56, 56, sh.tiles[n % 4], 16)
        else: sh.sticker(x0 + 42, y + 42, 24, sh.tiles[n % 4], "me", (-8, 6, -4, 9)[n], "#ffffff")
        if sh.brand == "sosed": sh.icon(x0 + 30, y + 30, "me", ink(sh, sh.tiles[n % 4]))
        sh.text(x0 + 88, y + 36, name, 20, k["fg"], 600)
        sh.text(x0 + 88, y + 62, last, 16, k["accent-text"] if kind == "offer" else k["fg-muted"])
        sh.icon(x1 - 40, y + 30, "fwd", k["fg-muted"])
    sh.label(x0, 720, "a list, not a grid: one column 640 at any width")
    sh.save(f"adaptive-{sh.brand}-inbox-1440")


def s_chat(sh):
    k = sh.k,
    k = sh.k
    x0, x1 = frame(sh, 2, "Anya", back=True)
    msgs = (("theirs", "hi! are you at the river already?"), ("mine", "on my way, five minutes"),
            ("theirs", "great, I'm by the bridge with a dog"), ("mine", "see you there"), ("theirs", "🙂"))
    y = 140
    for who, t in msgs:
        lines = wrap(t, 18, 420); bw = max(len(l) for l in lines) * 18 * 0.54 + 40; bh = len(lines) * 26 + 24
        x = x1 - bw if who == "mine" else x0
        fill = k["accent"] if who == "mine" else k["surface"]
        col = k["accent-fg"] if who == "mine" else k["fg"]
        if sh.brand == "sosed": sh.rect(x, y, bw, bh, fill, 20)
        else: sh.sticker_rect(x, y, bw, bh, fill, 16, -0.8 if who == "theirs" else 0.8)
        yy = y + 34
        for l in lines: sh.text(x + 20, yy, l, 18, col); yy += 26
        y += bh + 16
    panel(sh, x0, sh.h - 104, 640 - 72, 64)
    sh.text(x0 + 24, sh.h - 64, "a line…", 18, k["fg-muted"])
    if sh.brand == "sosed": sh.rect(x1 - 64, sh.h - 104, 64, 64, k["accent"], 32)
    else: sh.sticker(x1 - 32, sh.h - 72, 30, k["accent"], "send", 0, k["accent-fg"])
    if sh.brand == "sosed": sh.icon(x1 - 44, sh.h - 84, "send", k["accent-fg"])
    sh.label(x0, sh.h - 16, "the line and its field held to the column 640, not to the screen")
    sh.save(f"adaptive-{sh.brand}-chat-1440")


def s_tables(sh):
    k, w = sh.k, sh.w
    rail = RAIL_W + (16 if sh.brand == "sosed" else 0); sh.rail = rail
    cap = 1280; x0 = rail + (w - rail - cap) / 2
    backdrop(sh, x0, x0 + cap); chrome(sh, 1)
    sh.text(x0, 70, "tables", 28 if sh.brand == "sosed" else 22, w=600)
    button(sh, x0 + cap - 220, 36, 220, "new table", "pri")
    sh.measure(x0, x0 + cap, 112, "content 1280 · 3 columns")
    names = (("dots 2×2", "playing 1 · watching 0 · 1 free"), ("dots 3×3 by the park", "playing 2 · watching 3"),
             ("chess on Friday", "playing 1 · 1 free"), ("dots 4×4", "playing 2 · watching 1"),
             ("quick dots", "playing 1 · 1 free"), ("yard league", "playing 2 · watching 5"))
    cw = (cap - 2 * GAP) / 3
    for n, (nm, meta) in enumerate(names):
        x = x0 + (n % 3) * (cw + GAP); y = 140 + (n // 3) * 230
        fill = sh.tiles[n % 4] if sh.brand == "sosed" else k["surface"]
        fg = ink(sh, fill) if sh.brand == "sosed" else k["fg"]
        panel(sh, x, y, cw, 210, fill, tilt=(0, -0.8, 0.6)[n % 3] if sh.brand == "neighbro" else 0)
        for a in range(3):
            for b in range(3): sh.a(f'<circle cx="{x + 32 + a * 22}" cy="{y + 36 + b * 22}" r="4" fill="{fg}"/>')
        sh.text(x + 24, y + 140, nm, 22, fg, 600); sh.text(x + 24, y + 170, meta, 16, fg)
        like_btn(sh, x + cw - 50, y + 44, 28, 6 if (n == 1 and sh.brand == "sosed") else (2 if n == 1 else 0), ink_=fg)
    sh.label(x0, sh.h - 24, "tables: a grid like the feed (2 / 3 / 4 columns); a table's own screen is one column")
    sh.save(f"adaptive-{sh.brand}-tables-1440")


def s_table(sh):
    k = sh.k
    x0, x1 = frame(sh, 1, "dots 3×3 by the park", back=True)
    panel(sh, x0, 130, 640, 64)
    sh.text(x0 + 24, 170, "your move · you 2 — Boris 1", 18, k["fg"], 600)
    bx, by, n, st = x0 + 120, 240, 4, 130
    for a in range(n):
        for b in range(n):
            if a < n - 1: sh.a(f'<path d="M{bx + a * st} {by + b * st} H{bx + (a + 1) * st}" stroke="{k["accent"] if (a + b) % 3 == 0 else k["surface-2"]}" stroke-width="{8 if (a + b) % 3 == 0 else 4}" stroke-linecap="round"/>')
            if b < n - 1: sh.a(f'<path d="M{bx + a * st} {by + b * st} V{by + (b + 1) * st}" stroke="{sh.tiles[2] if (a * b) % 2 == 1 else k["surface-2"]}" stroke-width="{8 if (a * b) % 2 == 1 else 4}" stroke-linecap="round"/>')
            sh.a(f'<circle cx="{bx + a * st}" cy="{by + b * st}" r="9" fill="{k["fg"]}"/>')
    lx = x1 + 48
    panel(sh, lx, 240, 220, 150)
    sh.text(lx + 20, 276, "whose lines", 16, k["fg-muted"], 600)
    for j, (nm, c) in enumerate((("you", k["accent"]), ("Boris", sh.tiles[2]))):
        sh.a(f'<path d="M{lx + 20} {306 + j * 36} H{lx + 60}" stroke="{c}" stroke-width="8" stroke-linecap="round"/>'); sh.text(lx + 76, 312 + j * 36, nm, 16)
    sh.label(lx, 420, "legend beside the board from 1024")
    button(sh, x0, 680, 640, "leave the table", "sec", "back")
    sh.save(f"adaptive-{sh.brand}-table-1440")


def s_me(sh):
    k = sh.k
    x0, x1 = frame(sh, 3, "me")
    if sh.brand == "sosed":
        sh.rect(x0, 130, 640, 120, sh.tiles[0], 24); sh.text(x0 + 24, 200, "Anya, 28", 28, ink(sh, sh.tiles[0]), 600)
    else:
        sh.sticker(x0 + 50, 190, 44, sh.tiles[3], "me", -6, "#ffffff"); sh.text(x0 + 116, 200, "Anya, 28", 22, k["fg"], 600)
    rows = (("eye", "appearance", "light · amber"), ("globe", "language", "English"), ("key", "recovery code", "shown once"),
            ("device", "move to another device", ""), ("tables", "my tables", "2"), ("more", "documents", ""))
    for n, (ic, lab, val) in enumerate(rows):
        x = x0 + (n % 2) * 328; y = 280 + (n // 2) * 96
        fill = sh.tiles[(n + 1) % 4] if sh.brand == "sosed" else None
        fg = ink(sh, fill) if fill else k["fg"]
        panel(sh, x, y, 312, 80, fill)
        sh.icon(x + 20, y + 28, ic, fg); sh.text(x + 56, y + 36, lab, 16, fg, 600)
        if val: sh.text(x + 56, y + 60, val, 14, fg)
    panel(sh, x0, 580, 640, 64)
    sh.text(x0 + 24, 620, "start over on this device", 16, k["danger"], 600)
    sh.label(x0, 690, "settings in pairs inside the 640 column (sosed's mosaic; neighbro's stickers)")
    sh.save(f"adaptive-{sh.brand}-me-1440")


def s_register(sh):
    k = sh.k
    sh.rail = 0
    if sh.brand == "neighbro": sh.a(f'<rect width="{sh.w}" height="{sh.h}" fill="url(#dots)"/>')
    x0 = (sh.w - 440) / 2
    mark(sh, sh.w / 2, 110, 72)
    sh.text(x0, 210, "who are you", 28, w=600)
    sh.text(x0, 240, "step 1 of 3", 16, k["fg-muted"])
    for j, (lab, val) in enumerate((("name", "Anya"), ("age", "28"))):
        y = 270 + j * 104
        sh.text(x0, y + 16, lab, 16, k["fg-muted"], 600)
        panel(sh, x0, y + 28, 440, 56); sh.text(x0 + 20, y + 64, val, 18)
    panel(sh, x0, 490, 28, 28, k["accent"], 6); sh.icon(x0 + 2, 492, "check", k["accent-fg"])
    sh.text(x0 + 44, 510, "I accept the rules and the privacy notice", 16)
    button(sh, x0, 560, 440, "next", "pri")
    sh.measure(x0, x0 + 440, 660, "form 440 — the phone's, at any width; no rail before sign-in")
    sh.save(f"adaptive-{sh.brand}-register-1440")


# ---------- sign-up in the brand's language (owner 11.10.2026: «the sign-up steps are dull and unlike the app»)
ICON.update({
    "user": '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20 C5.5 15.5 18.5 15.5 19.5 20"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5 V7.5 A4 4 0 0 1 16 7.5 V10.5"/>',
    "paper": '<path d="M6 3.5 H14.5 L18.5 7.5 V20.5 H6 Z"/><path d="M14.5 3.5 V7.5 H18.5 M9 12 H15.5 M9 15.5 H15.5"/>',
    "doc": '<path d="M6 3.5 H18 V20.5 H6 Z"/><path d="M9 8 H15 M9 11.5 H15 M9 15 H13"/>',
})
REG = {1: ("who are you", "user", "a name neighbours will see, and your age"),
       2: ("your PIN", "lock", "six digits open this device's vault"),
       3: ("paper code", "paper", "write it down: it brings you back on any new device")}


def s_register_step(brand, step):
    sh = Sheet(brand, 393, 851)
    k = sh.k; x0 = 16; W = 361
    sh.rail = 0
    if brand == "neighbro": sh.a(f'<rect width="393" height="851" fill="url(#dots)"/>')
    title, ic, line = REG[step]
    # progress: three cells, the done ones filled
    for j in range(3):
        on = j < step
        if brand == "sosed": sh.rect(x0 + j * 40, 24, 32, 12, sh.tiles[j] if on else k["surface-2"], 6)
        else: sh.sticker(x0 + 14 + j * 36, 30, 10, sh.tiles[(j + 1) % 4] if on else k["surface"], "check" if on and j < step - 1 else "user", (-8, 6, -4)[j], "#ffffff")
    sh.text(x0 + 140, 36, f"step {step} of 3", 14, k["fg-muted"], 600)
    # hero
    if brand == "sosed":
        c = (k["accent"], sh.tiles[1], sh.tiles[3])[step - 1]; fg = ink(sh, c) if step > 1 else k["accent-fg"]
        sh.rect(x0, 56, W, 168, c, 28)
        sh.icon(x0 + 24, 80, ic, fg, 2.2)
        sh.text(x0 + 24, 176, title, 28, fg, 600); sh.text(x0 + 24, 204, line, 16, fg)
        y = 248
    else:
        sh.sticker(x0 + 70, 132, 52, sh.tiles[(step) % 4], ic, -8, "#ffffff")
        sh.text(x0 + 140, 128, title, 28, w=600);
        for n, l in enumerate(wrap(line, 16, 210)): sh.text(x0 + 140, 154 + n * 22, l, 16, k["fg-muted"])
        y = 214
    def field(label, value, y, hint=None, w=W, x=x0):
        sh.text(x, y + 16, label, 14, k["fg-muted"], 600)
        if brand == "sosed": sh.rect(x, y + 26, w, 56, k["surface"], 18, f'stroke="{k["line"]}" stroke-width="1.5"')
        else: sh.sticker_rect(x, y + 26, w, 56, k["surface"], 16)
        sh.text(x + 18, y + 62, value, 20, k["fg"] if value[:1] != "·" else k["fg-muted"], 600 if value[:1] != "·" else 400)
        if hint: sh.text(x, y + 102, hint, 14, k["fg-muted"])
        return y + (110 if hint else 96)
    if step == 1:
        y = field("name", "Anya", y, "24 letters left")
        y = field("age", "28", y, "from 13", w=160)
        # consent as one tile: the box, the sentence, the three documents as chips
        if brand == "sosed": sh.rect(x0, y, W, 132, k["surface-2"], 22)
        else: sh.sticker_rect(x0, y, W, 132, k["surface"], 18, -0.6)
        sh.rect(x0 + 16, y + 18, 28, 28, k["accent"], 8); sh.icon(x0 + 18, y + 20, "check", k["accent-fg"])
        sh.text(x0 + 56, y + 38, "I accept the rules", 16, k["fg"], 600)
        for j, d in enumerate(("terms", "privacy", "community")):
            cx = x0 + 16 + j * 112
            if brand == "sosed": sh.rect(cx, y + 64, 104, 44, k["surface"], 22, f'stroke="{k["line"]}" stroke-width="1.5"')
            else: sh.sticker_rect(cx, y + 64, 104, 44, k["surface"], 22, (-2, 1.5, -1)[j])
            sh.icon(cx + 10, y + 74, "doc", k["accent-text"], 0.85); sh.text(cx + 36, y + 92, d, 14, k["accent-text"], 600)
        btn = "next"
    elif step == 2:
        y = field("PIN, 6 digits", "· · · · · ·", y)
        y = field("again", "· · · · · ·", y)
        sh.text(x0, y + 8, "the PIN never leaves this device", 14, k["fg-muted"])
        btn = "create"
    else:
        groups = ("FEP0", "4AXR", "1JVV", "A4E3")
        for j, g in enumerate(groups):
            gx = x0 + (j % 2) * 186; gy = y + (j // 2) * 92
            if brand == "sosed": sh.rect(gx, gy, 175, 80, sh.tiles[j], 22)
            else: sh.sticker_rect(gx, gy, 175, 80, k["surface"], 16, (-2, 1.5, 1, -1.5)[j])
            col = ink(sh, sh.tiles[j]) if brand == "sosed" else k["fg"]
            sh.text(gx + 16, gy + 26, str(j + 1), 14, col, 600)
            sh.text(gx + 88, gy + 58, g, 28, col, 600, "middle")
        y += 200
        sh.text(x0, y, "written down? type groups 2 and 4", 16, k["fg"], 600)
        y = field("group 2", "4AXR", y + 8, w=170)
        field("group 4", "· · · ·", y - 96, w=170, x=x0 + 186)
        btn = "done"
    by = 851 - 96
    if brand == "sosed": sh.rect(x0, by, W, 64, k["accent"], 32)
    else: sh.sticker_rect(x0, by, W, 60, k["accent"], 30)
    sh.text(x0 + W / 2, by + 38, btn, 18, k["accent-fg"], 600, "middle")
    sh.save(f"adaptive-{brand}-register-{step}")


# ---------- every other screen in the same language (owner 11.10.2026: «everything in the new design»):
# three shapes — a form, a list, a message — each opened by the brand's hero (a tile / a big sticker).
ICON.update({
    "unlock": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5 V7.5 A4 4 0 0 1 15.5 6"/>',
    "restore": '<path d="M5 12 A7 7 0 1 0 7.5 6.6"/><path d="M5 4.5 V8.5 H9"/>',
    "bye": '<path d="M8 13 V6 A1.5 1.5 0 0 1 11 6 V12 M11 11 V4.5 A1.5 1.5 0 0 1 14 4.5 V12 M14 11 V6 A1.5 1.5 0 0 1 17 6 V14 C17 18 15 21 11 21 C8 21 6 19 4.5 16 L3.5 13 A1.4 1.4 0 0 1 6 12 L8 15"/>',
})


def hero(sh, title, ic, line, colour_i=0):
    k = sh.k; x0, W = 16, 361
    if sh.brand == "sosed":
        c = (k["accent"], *sh.tiles)[colour_i % 5]; fg = k["accent-fg"] if colour_i == 0 else ink(sh, c)
        lines = wrap(line, 16, W - 48)[:3]; h = 140 + len(lines) * 22
        sh.rect(x0, 24, W, h, c, 28); sh.icon(x0 + 24, 46, ic, fg, 2.2)
        sh.text(x0 + 24, 138, title, 28, fg, 600)
        for n, l in enumerate(lines): sh.text(x0 + 24, 164 + n * 22, l, 16, fg)
        return 24 + h + 24
    sh.sticker(x0 + 66, 96, 50, sh.tiles[colour_i % 4], ic, -8, "#ffffff")
    tl = wrap(title, 22, 215)
    for n, l in enumerate(tl): sh.text(x0 + 134, 84 + n * 28, l, 22, w=600)
    yy = 84 + len(tl) * 28
    for n, l in enumerate(wrap(line, 16, 215)[:3]): sh.text(x0 + 134, yy + n * 22, l, 16, k["fg-muted"])
    return max(176, yy + 3 * 22 + 8)


def box(sh, x, y, w, h, fill=None, tilt=0):
    k = sh.k
    if sh.brand == "sosed": sh.rect(x, y, w, h, fill or k["surface"], 18, "" if fill else f'stroke="{k["line"]}" stroke-width="1.5"')
    else: sh.sticker_rect(x, y, w, h, fill or k["surface"], 16, tilt)


def foot(sh, label, second=None):
    k = sh.k; x0, W = 16, 361; by = 851 - (156 if second else 96)
    if sh.brand == "sosed": sh.rect(x0, by, W, 64, k["accent"], 32)
    else: sh.sticker_rect(x0, by, W, 60, k["accent"], 30)
    sh.text(x0 + W / 2, by + 38, label, 18, k["accent-fg"], 600, "middle")
    if second:
        box(sh, x0, by + 76, W, 56); sh.text(x0 + W / 2, by + 110, second, 16, k["fg"], 600, "middle")


# ---------- welded parts (owner 11.10.2026: «what stands side by side is joined into one component»):
# one ground, one rim, one shadow; inner dividers in the ground colour (sosed) or the die-cut colour (neighbro).
def weld(sh, x, y, w, h, parts, fill=None, tilt=0):
    """A strip of `parts` cells sharing one body; returns the cells' x positions and width."""
    k = sh.k
    box(sh, x, y, w, h, fill, tilt)
    cw = w / parts
    div = k["bg"] if sh.brand == "sosed" else k["line"]
    for j in range(1, parts):
        sh.a(f'<path d="M{x + j * cw:.1f} {y + 8} V{y + h - 8}" stroke="{div}" stroke-width="{2 if sh.brand == "sosed" else 1.5}"/>')
    return [x + j * cw for j in range(parts)], cw


def field_card(sh, x, y, w, label, value, hint=None, muted=False):
    """Label, field and hint as one card: the label inside on top, the hint inside at the foot."""
    k = sh.k; h = 76 + (22 if hint else 0)
    box(sh, x, y, w, h)
    sh.text(x + 18, y + 24, label, 14, k["fg-muted"], 600)
    sh.text(x + 18, y + 56, value, 20, k["fg-muted"] if muted else k["fg"], 400 if muted else 600)
    if hint:
        sh.a(f'<path d="M{x + 14} {y + 72} H{x + w - 14}" stroke="{k["surface-2"] if sh.brand == "sosed" else k["line"]}" stroke-width="1"/>')
        sh.text(x + 18, y + 90, hint, 14, k["fg-muted"])
    return y + h + 12


def split_foot(sh, main, second):
    """The main action and the second one welded into one button: a big part and a small part."""
    k = sh.k; x0, W = 16, 361; by = 851 - 96
    if sh.brand == "sosed":
        sh.rect(x0, by, W, 64, k["accent"], 32)
        sh.a(f'<path d="M{x0 + W - 120} {by + 12} V{by + 52}" stroke="{k["accent-fg"]}" stroke-width="1.5" opacity=".5"/>')
    else:
        sh.sticker_rect(x0, by, W, 60, k["accent"], 30)
        sh.a(f'<path d="M{x0 + W - 120} {by + 10} V{by + 50}" stroke="{k["accent-fg"]}" stroke-width="1.5" opacity=".5"/>')
    sh.text(x0 + (W - 120) / 2, by + 38, main, 18, k["accent-fg"], 600, "middle")
    sh.text(x0 + W - 60, by + 38, second, 14, k["accent-fg"], 600, "middle")


def s_unlock(brand):
    sh = Sheet(brand, 393, 851); k = sh.k
    if brand == "neighbro": sh.a('<rect width="393" height="851" fill="url(#dots)"/>')
    y = hero(sh, "welcome back", "unlock", "type your PIN to open this device's vault", 2)
    sh.text(16, y + 16, "PIN", 14, k["fg-muted"], 600)
    for j in range(6):
        box(sh, 16 + j * 61, y + 28, 52, 64, None, (-2, 1, -1, 2, -1, 1)[j])
        if j < 4: sh.a(f'<circle cx="{16 + j * 61 + 26}" cy="{y + 60}" r="7" fill="{k["fg"]}"/>')
    sh.text(16, y + 128, "3 tries left before a pause", 14, k["fg-muted"])
    foot(sh, "open", "forgot the PIN — paper code")
    sh.save(f"adaptive-{brand}-unlock")


def s_restore(brand):
    sh = Sheet(brand, 393, 851); k = sh.k
    if brand == "neighbro": sh.a('<rect width="393" height="851" fill="url(#dots)"/>')
    y = hero(sh, "back by paper code", "restore", "the four groups you wrote down, and a new PIN", 3)
    for j, g in enumerate(("FEP0", "4AXR", "1JVV", "····")):
        gx = 16 + (j % 2) * 186; gy = y + (j // 2) * 76
        box(sh, gx, gy, 175, 64, None, (-1.5, 1, 1.5, -1)[j])
        sh.text(gx + 14, gy + 22, str(j + 1), 14, k["fg-muted"], 600); sh.text(gx + 88, gy + 46, g, 24, k["fg"], 600, "middle")
    y += 168
    for lab in ("new PIN", "again"):
        sh.text(16, y + 16, lab, 14, k["fg-muted"], 600); box(sh, 16, y + 26, 361, 56); sh.text(34, y + 62, "· · · · · ·", 20, k["fg-muted"]); y += 96
    foot(sh, "come back")
    sh.save(f"adaptive-{brand}-restore")


def s_likes(brand):
    sh = Sheet(brand, 393, 851); k = sh.k
    if brand == "neighbro": sh.a('<rect width="393" height="851" fill="url(#dots)"/>')
    y = hero(sh, "my likes", f"mk_{brand}", "what you said «like» to; you can take it back until a match", 1)
    for j, t in enumerate(("walking to the river, join?", "coffee at the corner bakery", "a chess partner in the yard")):
        fill = sh.tiles[j + 1] if brand == "sosed" else None
        box(sh, 16, y, 361, 104, fill, (-0.6, 0.5, -0.4)[j])
        fg = ink(sh, fill) if fill else k["fg"]
        sh.text(36, y + 38, t, 18, fg, 600)
        like_btn(sh, 48, y + 74, 24, 6 if brand == "sosed" else 2, ink_=fg); sh.text(68, y + 80, f"{j + 3} · 2 h ago", 14, fg)
        sh.icon(361 - 22, y + 60, "close", fg) if "close" in ICON else None
        y += 120
    sh.save(f"adaptive-{brand}-likes")


def s_departure(brand):
    sh = Sheet(brand, 393, 851); k = sh.k
    if brand == "neighbro": sh.a('<rect width="393" height="851" fill="url(#dots)"/>')
    y = hero(sh, "leaving sosed?" if brand == "sosed" else "leaving neighbro?", "bye", "your phrases, likes and talks go with you; this can't be undone", 4)
    for j, t in enumerate(("phrases fade at once", "talks close for both sides", "the paper code stops working")):
        box(sh, 16, y, 361, 64, None, (-0.5, 0.4, -0.3)[j]); sh.icon(32, y + 20, "check", k["fg"]); sh.text(66, y + 40, t, 16, k["fg"], 600); y += 76
    foot(sh, "stay", "leave for good")
    sh.save(f"adaptive-{brand}-departure")


# ---------- welded versions (11.10.2026, owner: join what stands together)
ICON.setdefault("move", '<rect x="3" y="6" width="7" height="12" rx="1.5"/><rect x="14" y="6" width="7" height="12" rx="1.5"/><path d="M10.5 12 H13.5 M12 10.5 L13.5 12 L12 13.5"/>')


def bg(sh):
    if sh.brand == "neighbro": sh.a('<rect width="393" height="851" fill="url(#dots)"/>')


def s_unlock(brand):
    sh = Sheet(brand, 393, 851); k = sh.k; bg(sh)
    y = hero(sh, "welcome back", "unlock", "type your PIN to open this device's vault", 2)
    sh.text(16, y + 4, "PIN", 14, k["fg-muted"], 600)
    xs, cw = weld(sh, 16, y + 14, 361, 72, 6)
    for j, x in enumerate(xs[:4]): sh.a(f'<circle cx="{x + cw / 2:.1f}" cy="{y + 50}" r="7" fill="{k["fg"]}"/>')
    sh.a(f'<rect x="{xs[4] + cw / 2 - 1:.1f}" y="{y + 34}" width="2" height="32" fill="{k["accent"]}"/>')
    sh.text(16, y + 112, "3 tries left before a pause", 14, k["fg-muted"])
    split_foot(sh, "open", "paper code", ("unlock", "paper"))
    sh.save(f"adaptive-{brand}-unlock")


def s_restore(brand):
    sh = Sheet(brand, 393, 851); k = sh.k; bg(sh)
    y = hero(sh, "back by paper code", "restore", "the four groups you wrote down, and a new PIN", 3)
    xs, cw = weld(sh, 16, y, 361, 84, 4)
    for j, (x, g) in enumerate(zip(xs, ("FEP0", "4AXR", "1JVV", "····"))):
        sh.text(x + 12, y + 22, str(j + 1), 14, k["fg-muted"], 600); sh.text(x + cw / 2, y + 60, g, 22, k["fg"], 600, "middle")
    y += 104
    xs, cw = weld(sh, 16, y + 20, 361, 64, 6)
    sh.text(16, y + 12, "new PIN", 14, k["fg-muted"], 600)
    y += 104
    xs, cw = weld(sh, 16, y + 20, 361, 64, 6)
    sh.text(16, y + 12, "again", 14, k["fg-muted"], 600)
    split_foot(sh, "come back", "new code", ("restore", "paperplus"))
    sh.save(f"adaptive-{brand}-restore")


def s_departure(brand):
    # «departure» is moving to another device (web/src/screens/Departure.tsx): the price, the PIN, nine
    # characters to type on the new device, then «it is me».
    sh = Sheet(brand, 393, 851); k = sh.k; bg(sh)
    y = hero(sh, "move to another device", "move", "type these nine characters on the new one; this device lets go", 4)
    xs, cw = weld(sh, 16, y, 361, 84, 3)
    for x, g in zip(xs, ("X6X", "T88", "NQ4")): sh.text(x + cw / 2, y + 54, g, 28, k["fg"], 600, "middle")
    y += 104
    box(sh, 16, y, 361, 72)
    sh.icon(32, y + 24, "check", k["fg"]); sh.text(66, y + 32, "the new device asked:", 14, k["fg-muted"])
    sh.text(66, y + 56, "check 7F2Q", 20, k["fg"], 600)
    split_foot(sh, "it is me", "cancel", ("itsme", "close"))
    sh.save(f"adaptive-{brand}-departure")


def s_register_step(brand, step):
    sh = Sheet(brand, 393, 851); k = sh.k; bg(sh)
    title, ic, line = REG[step]
    # progress: one capsule (radius = half its height — owner 11.10: the strip looked squashed when it took the
    # box's 18 on a height of 14); the steps done are capsules inside it
    px, py, pw, ph = 16, 10, 132, 20
    if brand == "sosed": sh.rect(px, py, pw, ph, k["surface-2"], ph / 2)
    else: sh.sticker_rect(px, py, pw, ph, k["surface"], ph / 2)
    seg = (pw - 8 - 2 * 4) / 3
    for j in range(step):
        c = (k["accent"], sh.tiles[1], sh.tiles[3])[j] if brand == "sosed" else sh.tiles[(j + 1) % 4]
        sh.rect(px + 4 + j * (seg + 4), py + 4, seg, ph - 8, c, (ph - 8) / 2)
    sh.text(px + pw + (12 if brand == "sosed" else 18), py + 15, f"{step} / 3", 14, k["fg-muted"], 600)
    sh.buf  # keep
    y = hero_at(sh, title, ic, line, (0, 1, 3)[step - 1], 36)
    if step == 1:
        y = field_card(sh, 16, y, 361, "name", "Anya", "24 letters left")
        y = field_card(sh, 16, y, 170, "age", "28", "from 13")
        # consent: the box and the three documents welded into one plate
        xs, cw = weld(sh, 16, y + 4, 361, 64, 4, k["surface-2"] if brand == "sosed" else None)
        sh.rect(xs[0] + cw / 2 - 16, y + 20, 32, 32, k["accent"], 8); sh.icon(xs[0] + cw / 2 - 12, y + 24, "check", k["accent-fg"])
        for x, d in zip(xs[1:], ("terms", "privacy", "rules")):
            sh.icon(x + cw / 2 - 12, y + 14, "doc", k["accent-text"]); sh.text(x + cw / 2, y + 56, d, 14, k["accent-text"], 600, "middle")
        foot(sh, "next", icon="next")
    elif step == 2:
        sh.text(16, y + 4, "PIN", 14, k["fg-muted"], 600)
        weld(sh, 16, y + 14, 361, 64, 6); y += 96
        sh.text(16, y + 4, "again", 14, k["fg-muted"], 600)
        weld(sh, 16, y + 14, 361, 64, 6); y += 96
        sh.text(16, y + 4, "the PIN never leaves this device", 14, k["fg-muted"])
        foot(sh, "create", icon="lockok")
    else:
        xs, cw = weld(sh, 16, y, 361, 92, 4)
        for j, (x, g) in enumerate(zip(xs, ("FEP0", "4AXR", "1JVV", "A4E3"))):
            sh.text(x + 12, y + 22, str(j + 1), 14, k["fg-muted"], 600); sh.text(x + cw / 2, y + 64, g, 22, k["fg"], 600, "middle")
        y += 116
        sh.text(16, y, "written down? groups 2 and 4", 16, k["fg"], 600)
        xs, cw = weld(sh, 16, y + 14, 361, 64, 2)
        sh.text(xs[0] + 16, y + 54, "2 · 4AXR", 20, k["fg"], 600); sh.text(xs[1] + 16, y + 54, "4 · ····", 20, k["fg-muted"])
        foot(sh, "done", icon="check")
    sh.save(f"adaptive-{brand}-register-{step}")


def hero_at(sh, title, ic, line, colour_i, top):
    """The hero, starting at `top` (the register steps keep their progress strip above it)."""
    k = sh.k; x0, W = 16, 361
    if sh.brand == "sosed":
        c = (k["accent"], *sh.tiles)[colour_i % 5]; fg = k["accent-fg"] if colour_i == 0 else ink(sh, c)
        lines = wrap(line, 16, W - 48)[:3]; h = 128 + len(lines) * 22
        sh.rect(x0, top, W, h, c, 28); sh.icon(x0 + 24, top + 20, ic, fg, 2.0)
        sh.text(x0 + 24, top + 108, title, 28, fg, 600)
        for n, l in enumerate(lines): sh.text(x0 + 24, top + 134 + n * 22, l, 16, fg)
        return top + h + 20
    sh.sticker(x0 + 60, top + 64, 46, sh.tiles[(colour_i + 1) % 4], ic, -8, "#ffffff")
    tl = wrap(title, 22, 215)
    for n, l in enumerate(tl): sh.text(x0 + 124, top + 54 + n * 28, l, 22, w=600)
    yy = top + 54 + len(tl) * 28
    for n, l in enumerate(wrap(line, 16, 215)[:3]): sh.text(x0 + 124, yy + n * 22, l, 16, k["fg-muted"])
    return max(top + 140, yy + 3 * 22 + 8)


# ---------- buttons are icons, their words only their names (owner 11.10.2026: «clear icons instead of words»)
ICON.update({
    "next": '<path d="M5 12 H19 M13 6 L19 12 L13 18"/>',
    "lockok": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5 V7.5 A4 4 0 0 1 16 7.5 V10.5 M9.5 15.5 L11.5 17.5 L14.5 13.5"/>',
    "paperplus": '<path d="M6 3.5 H14.5 L18.5 7.5 V20.5 H6 Z"/><path d="M14.5 3.5 V7.5 H18.5 M12.25 11 V17 M9.25 14 H15.25"/>',
    "itsme": '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20 C4.5 15.5 15.5 15.5 16.5 20 M15.5 11.5 L17.5 13.5 L21 9.5"/>',
})


def foot(sh, label, second=None, icon=None):
    """The main action as an icon (its word is only its name); `second` an icon too when given as (icon, name)."""
    k = sh.k; x0, W = 16, 361; by = 851 - 96
    if sh.brand == "sosed": sh.rect(x0, by, W, 64, k["accent"], 32)
    else: sh.sticker_rect(x0, by, W, 60, k["accent"], 30)
    sh.icon(x0 + W / 2 - 18, by + 12, icon or "check", k["accent-fg"], 1.5)
    sh.text(x0 + W - 12, by - 8, f"name: «{label}»", 14, k["fg-muted"], 400, "end")


def split_foot(sh, main, second, icons=("check", "close")):
    """Main and second action welded, both icons; their words are their names only."""
    k = sh.k; x0, W = 16, 361; by = 851 - 96
    if sh.brand == "sosed": sh.rect(x0, by, W, 64, k["accent"], 32)
    else: sh.sticker_rect(x0, by, W, 60, k["accent"], 30)
    sh.a(f'<path d="M{x0 + W - 110} {by + 12} V{by + 50}" stroke="{k["accent-fg"]}" stroke-width="1.5" opacity=".5"/>')
    sh.icon(x0 + (W - 110) / 2 - 18, by + 12, icons[0], k["accent-fg"], 1.5)
    sh.icon(x0 + W - 55 - 15, by + 15, icons[1], k["accent-fg"], 1.25)
    sh.text(x0 + W - 12, by - 8, f"names: «{main}» · «{second}»", 14, k["fg-muted"], 400, "end")


# ---------- the rest of the screens (owner 11.10.2026: «go on drawing the other pages»), same language
ICON.update({
    "pause": '<path d="M9 6 V18 M15 6 V18"/>',
    "palette": '<path d="M12 3.5 A8.5 8.5 0 1 0 12 20.5 C13.5 20.5 13.5 18.5 12.5 17.5 C11.5 16.5 12.5 14.5 14 14.5 H16.5 A4 4 0 0 0 20.5 10.5 C20.5 6.5 16.5 3.5 12 3.5Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8" r="1"/>',
    "age": '<path d="M4 12 H20 M8 8 L4 12 L8 16 M16 8 L20 12 L16 16"/>',
    "pen": '<path d="M4 20 L5 15 L16 4 L20 8 L9 19Z"/><path d="M14 6 L18 10"/>',
    "eyeoff": '<path d="M3 12 C6 7 18 7 21 12 C18 17 6 17 3 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 L20 4"/>',
    "block": '<circle cx="12" cy="12" r="8.5"/><path d="M6 6 L18 18"/>',
    "scale": '<path d="M12 4 V20 M6 20 H18 M5 8 H19 M5 8 L2.5 14 H7.5 Z M19 8 L16.5 14 H21.5 Z"/>',
    "out": '<path d="M14 4 H20 V10 M20 4 L11 13 M18 14 V20 H4 V6 H10"/>',
    "trash": '<path d="M5 7 H19 L18 21 H6Z"/><path d="M3 7 H21 M9 7 V4 H15 V7"/>',
    "dots": '<circle cx="7" cy="7" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="17" cy="7" r="1.5"/><circle cx="7" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="7" cy="17" r="1.5"/><circle cx="12" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>',
    "globe2": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12 H20.5 M12 3.5 C9 7 9 17 12 20.5 C15 17 15 7 12 3.5"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5 V7.5 A4 4 0 0 1 16 7.5 V10.5"/>',
    "timer": '<circle cx="12" cy="13" r="7.5"/><path d="M12 9 V13 H15 M10 3 H14"/>',
})


def rows(sh, y, items, icon_right=None):
    """A list welded into one plate: rows split by hairlines, an icon on the left, an icon action on the right."""
    k = sh.k; h = 64
    box(sh, 16, y, 361, h * len(items))
    for j, item in enumerate(items):
        ic, t, sub = item[:3]; right = item[3] if len(item) > 3 else icon_right
        yy = y + j * h
        if j: sh.a(f'<path d="M30 {yy} H363" stroke="{k["surface-2"] if sh.brand == "sosed" else k["line"]}" stroke-width="1"/>')
        sh.icon(30, yy + 20, ic, k["fg"]); sh.text(64, yy + (30 if sub else 38), t, 16, k["fg"], 600)
        if sub: sh.text(64, yy + 50, sub, 14, k["fg-muted"])
        if right: sh.icon(331, yy + 20, right, k["accent-text"] if right == "check" else k["fg-muted"])
    return y + h * len(items) + 16


def chips(sh, y, items, on=0, cols=3):
    """A choice of N welded into one segmented plate; the chosen part filled."""
    k = sh.k; w = 361; ch = 56
    nrows = -(-len(items) // cols)
    for r in range(nrows):
        part = items[r * cols:(r + 1) * cols]
        xs, cw = weld(sh, 16, y + r * (ch + 10), w, ch, len(part))
        for j, (x, (ic, t)) in enumerate(zip(xs, part)):
            idx = r * cols + j
            if idx == on:
                sh.rect(x + 4, y + r * (ch + 10) + 4, cw - 8, ch - 8, k["accent"], (ch - 8) / 2)
            col = k["accent-fg"] if idx == on else k["fg"]
            if ic: sh.icon(x + cw / 2 - 12, y + r * (ch + 10) + 8, ic, col, 0.85)
            sh.text(x + cw / 2, y + r * (ch + 10) + (46 if ic else 34), t, 14 if ic else 16, col, 600, "middle")
    return y + nrows * (ch + 10) + 8


def page(brand, name, title, ic, line, colour, body, foot_args=None, split=None):
    sh = Sheet(brand, 393, 851); bg(sh)
    y = hero(sh, title, ic, line, colour)
    body(sh, y)
    if split: split_foot(sh, *split)
    elif foot_args: foot(sh, *foot_args[:1], icon=foot_args[1])
    sh.save(f"adaptive-{brand}-{name}")


def draw_rest(brand):
    page(brand, "locked", "a pause", "lock", "too many wrong PINs; the vault opens again in 4 minutes", 4,
         lambda sh, y: (sh.text(16, y + 10, "back in", 14, sh.k["fg-muted"], 600), weld(sh, 16, y + 20, 361, 72, 2),
                        sh.text(16 + 90, y + 66, "04", 28, sh.k["fg"], 600, "middle"), sh.text(16 + 270, y + 66, "12", 28, sh.k["fg"], 600, "middle")),
         split=("wait", "paper code", ("timer", "paper")))
    page(brand, "change-pin", "a new PIN", "lockok", "the old one, then the new one twice", 1,
         lambda sh, y: [(sh.text(16, y + 4 + i * 92, lab, 14, sh.k["fg-muted"], 600), weld(sh, 16, y + 14 + i * 92, 361, 64, 6)) for i, lab in enumerate(("old PIN", "new PIN", "again"))],
         ("save", "check"))
    page(brand, "reissue", "a new paper code", "paperplus", "the old code stops working the moment this one is shown", 3,
         lambda sh, y: (sh.text(16, y + 4, "PIN", 14, sh.k["fg-muted"], 600), weld(sh, 16, y + 14, 361, 64, 6),
                        rows(sh, y + 100, [("check", "the old code stops at once", None), ("paper", "write the new one down", None)])),
         ("show", "paperplus"))
    page(brand, "reset", "start over here", "trash", "this device forgets you; the paper code still brings you back", 4,
         lambda sh, y: rows(sh, y, [("eyeoff", "phrases leave the feed", None), ("chat", "talks end for both", None), ("paper", "the paper code still works", None)]),
         split=("forget", "stay", ("trash", "back")))
    page(brand, "step-away", "step away", "pause", "your phrases come down; you come back when you like", 2,
         lambda sh, y: chips(sh, y, [("timer", "1 h"), ("timer", "1 day"), ("timer", "1 week"), (None, "until I'm back")], on=1, cols=2),
         ("step away", "pause"))
    page(brand, "away", "you stepped away", "pause", "nobody sees your phrases until you are back", 2,
         lambda sh, y: rows(sh, y, [("timer", "back in 23 h", "or now, with one tap")]),
         ("come back", "next"))
    page(brand, "theme", "how it looks", "palette", "light, dark or by the time of day; an accent", 1,
         lambda sh, y: (chips(sh, y, [("sun", "light"), ("lock", "dark"), ("timer", "auto")], on=2),
                        sh.text(16, y + 90, "accent", 14, sh.k["fg-muted"], 600),
                        [sh.a(f'<circle cx="{44 + i * 64}" cy="{y + 132}" r="22" fill="{c}" stroke="{sh.k["fg"] if i == 0 else "none"}" stroke-width="3"/>') for i, c in enumerate([sh.k["accent"], *sh.tiles])]),
         ("save", "check"))
    page(brand, "lang", "language", "globe2", "the app speaks it; phrases stay as written", 3,
         lambda sh, y: rows(sh, y, [("globe2", "Русский", None, "check"), ("globe2", "English", None), ("globe2", "Ελληνικά", None), ("globe2", "Українська", None), ("globe2", "ქართული", None)]),
         None)
    page(brand, "age-filter", "whose phrases", "age", "the ages you see in the feed", 1,
         lambda sh, y: (weld(sh, 16, y, 361, 72, 2), sh.text(36, y + 26, "from", 14, sh.k["fg-muted"], 600), sh.text(36, y + 56, "22", 24, sh.k["fg"], 600),
                        sh.text(216, y + 26, "to", 14, sh.k["fg-muted"], 600), sh.text(216, y + 56, "35", 24, sh.k["fg"], 600),
                        sh.rect(16, y + 100, 361, 8, sh.k["surface-2"], 4), sh.rect(120, y + 100, 120, 8, sh.k["accent"], 4),
                        sh.a(f'<circle cx="120" cy="{y + 104}" r="14" fill="{sh.k["surface"]}" stroke="{sh.k["accent"]}" stroke-width="3"/><circle cx="240" cy="{y + 104}" r="14" fill="{sh.k["surface"]}" stroke="{sh.k["accent"]}" stroke-width="3"/>')),
         ("save", "check"))
    page(brand, "edit-name", "your name", "pen", "neighbours see it after a match", 0,
         lambda sh, y: field_card(sh, 16, y, 361, "name", "Anya", "21 letters left"),
         ("save", "check"))
    page(brand, "new-table", "a new table", "dots", "a game, its size, a name; neighbours nearby can sit down", 1,
         lambda sh, y: (chips(sh, y, [("dots", "dots"), ("check", "words"), ("scale", "cards")], on=0),
                        chips(sh, y + 74, [(None, "2×2"), (None, "3×3"), (None, "4×4")], on=1),
                        field_card(sh, 16, y + 148, 361, "name", "by the park")),
         ("open the table", "next"))
    page(brand, "hidden", "hidden", "eyeoff", "what you hid stays out of your feed only", 2,
         lambda sh, y: rows(sh, y, [("eyeoff", "music in the yard", "hidden 2 h ago"), ("eyeoff", "selling a sofa", "hidden yesterday")], "restore"), None)
    page(brand, "blocked", "blocked", "block", "you and they don't see each other", 4,
         lambda sh, y: rows(sh, y, [("block", "Mark", "blocked 3 days ago"), ("block", "Lena", "blocked last week")], "close"), None)
    page(brand, "legal", "documents", "doc", "what you agreed to, and their editions", 3,
         lambda sh, y: rows(sh, y, [("doc", "terms", "16 Sep 2026"), ("doc", "privacy", "16 Sep 2026"), ("doc", "community rules", "15 Sep 2026")], "fwd"), None)
    page(brand, "statements", "decisions", "scale", "why something of yours came down, and how to appeal", 2,
         lambda sh, y: rows(sh, y, [("scale", "a phrase came down", "11 Oct · spam"), ("scale", "an offer link off", "9 Oct · rules")], "fwd"), None)
    page(brand, "offer-exit", "leaving for the venue", "out", "corner bakery's site opens; we only count the visit", 0,
         lambda sh, y: rows(sh, y, [("out", "corner-bakery.cy", "−15% · till 11:00")]),
         split=("go", "back", ("out", "back")))


# ---------- every screen and state, 100% (owner 11.10.2026; docs/design/screens-inventory.tsv,
# scripts/design/check-screens-drawn.sh)
ICON.update({
    "warn": '<path d="M12 3.5 L21 19.5 H3 Z"/><path d="M12 10 V14 M12 16.8 V17"/>',
    "mail": '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7 L12 13 L20 7"/>',
    "venue": '<path d="M4 10 L6 4.5 H18 L20 10 Z M5 10 V20 H19 V10 M10 20 V15 H14 V20"/>',
    "tag": '<path d="M4 12.5 V5 A1 1 0 0 1 5 4 H12.5 L20 11.5 L12.5 19Z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    "chat": '<path d="M4 6.5 A2.5 2.5 0 0 1 6.5 4 H17.5 A2.5 2.5 0 0 1 20 6.5 V14 A2.5 2.5 0 0 1 17.5 16.5 H10 L6 20 V16.5 A2.5 2.5 0 0 1 4 14Z"/>',
    "key": '<circle cx="8" cy="12" r="4"/><path d="M12 12 H20.5 M17.5 12 V15 M20 12 V14.5"/>',
    "end": '<path d="M5 15 C8 11 16 11 19 15 L17 17 L14 15.5 V13.5 C12.7 13.2 11.3 13.2 10 13.5 V15.5 L7 17Z"/>',
    "flag": '<path d="M5 21 V4 M5 4 H17 L15 8 L17 12 H5"/>',
    "trophy": '<path d="M8 4 H16 V9 A4 4 0 0 1 8 9 Z M8 6 H5 A3 3 0 0 0 8 11 M16 6 H19 A3 3 0 0 1 16 11 M12 13 V17 M8.5 20 H15.5 M10 17 H14"/>',
    "hand": '<path d="M8 13 V6 A1.5 1.5 0 0 1 11 6 V12 M11 11 V4.5 A1.5 1.5 0 0 1 14 4.5 V12 M14 11 V6 A1.5 1.5 0 0 1 17 6 V14 C17 18 15 21 11 21 C8 21 6 19 4.5 16 L3.5 13 A1.4 1.4 0 0 1 6 12 L8 15"/>',
    "people": '<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5 C4 15 14 15 14.5 19.5 M14 15 C17.5 14.5 20.5 16 20.5 19"/>',
    "plus": '<path d="M12 5 V19 M5 12 H19"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5"/>',
})


def err(sh, y, text):
    """The error line, welded to what it is about: a danger strip with the warning icon."""
    k = sh.k
    box(sh, 16, y, 361, 52, None)
    sh.rect(16, y, 8, 52, k["danger"], 4)
    sh.icon(36, y + 14, "warn", k["danger"]); sh.text(70, y + 32, text, 15, k["danger"], 600)
    return y + 64


def empty(sh, y, title, line):
    """An empty state: the brand's mark, pale, a line under it."""
    k = sh.k
    sh.a('<g opacity=".35">'); mark(sh, 196, y + 70, 96); sh.a('</g>')
    sh.text(196, y + 150, title, 20, k["fg"], 600, "middle")
    for n, l in enumerate(wrap(line, 15, 300)[:2]): sh.text(196, y + 176 + n * 20, l, 15, k["fg-muted"], 400, "middle")
    return y + 230


def bar(sh, title, back=True, right=None):
    """The top bar of an inner screen: back, title, an icon action; the mark only on the feed."""
    k = sh.k
    if back:
        if sh.brand == "sosed": sh.rect(16, 18, 44, 44, k["surface"], 22, f'stroke="{k["line"]}" stroke-width="1.5"'); sh.icon(26, 28, "back", k["fg"])
        else: sh.sticker(38, 40, 20, k["surface"], "back")
    sh.text(76 if back else 16, 48, title, 22, w=600)
    if right:
        if sh.brand == "sosed": sh.rect(333, 18, 44, 44, k["surface"], 22, f'stroke="{k["line"]}" stroke-width="1.5"'); sh.icon(343, 28, right, k["fg"])
        else: sh.sticker(355, 40, 20, k["surface"], right)
    return 80


def tabs_foot(sh, active):
    chrome(sh, active)


def phrase_tile(sh, x, y, w, text, i, liked=False, h=None):
    k = sh.k
    lines = wrap(text, 20, w - 36)[:3]; h = h or (44 + len(lines) * 26 + 56)
    fill = sh.tiles[i % 4] if sh.brand == "sosed" else k["surface"]
    fg = ink(sh, fill) if sh.brand == "sosed" else k["fg"]
    box(sh, x, y, w, h, fill, (-0.6, 0.5)[i % 2] if sh.brand == "neighbro" else 0)
    for n, l in enumerate(lines): sh.text(x + 18, y + 40 + n * 26, l, 20, fg, 600)
    mi, mw = MODES[i % 3]
    sh.icon(x + 16, y + h - 40, mi, fg, 0.8); sh.text(x + 40, y + h - 23, mw, 14, fg, 500)
    like_btn(sh, x + w - 58, y + h - 28, 24, (6 if sh.brand == "sosed" else 2) if liked else 0, ink_=fg)
    sh.text(x + w - 40, y + h - 22, str(3 + i), 16, fg, 600)
    return y + h + 14


def scr(brand, name, draw):
    sh = Sheet(brand, 393, 851); bg(sh); draw(sh); sh.save(f"adaptive-{brand}-{name}")


def draw_all(brand):
    T = lambda sh, x, y, s, size=16, fill=None, w=400, a="start": sh.text(x, y, s, size, fill, w, a)
    # --- entry states
    scr(brand, "splash-lang", lambda sh: (mark(sh, 196, 170, 140), sh.text(196, 290, brand, 36, sh.k["fg"], 600, "middle"),
        rows(sh, 330, [("globe2", "Русский", None, "check"), ("globe2", "English", None), ("globe2", "Ελληνικά", None), ("globe2", "Türkçe", None)]),
        sh.text(16, 620, "the language the page speaks; kept on this device", 14, sh.k["fg-muted"])))
    def reg_err(step, msg):
        def d(sh):
            title, ic, line = REG[step]
            y = hero_at(sh, title, ic, line, (0, 1, 3)[step - 1], 36)
            if step == 1: y = field_card(sh, 16, y, 361, "name", "Anya"); y = field_card(sh, 16, y, 170, "age", "12")
            elif step == 2: weld(sh, 16, y, 361, 64, 6); y += 80; weld(sh, 16, y, 361, 64, 6); y += 80
            else:
                xs, cw = weld(sh, 16, y, 361, 64, 2); T(sh, xs[0] + 16, y + 40, "2 · ZZZZ", 20, sh.k["danger"], 600); y += 80
            err(sh, y, msg); foot(sh, "next", icon="next")
        return d
    scr(brand, "register-1-young", reg_err(1, "from 13 years only"))
    scr(brand, "register-2-mismatch", reg_err(2, "the PINs differ"))
    scr(brand, "register-3-wrong", reg_err(3, "group 2 is not that"))
    scr(brand, "restore-wrong", lambda sh: (hero(sh, "back by paper code", "restore", "the four groups you wrote down", 3),
        weld(sh, 16, 230, 361, 84, 4), err(sh, 330, "no such code — check the groups"), split_foot(sh, "come back", "new code", ("restore", "paperplus"))))
    scr(brand, "arrival", lambda sh: (hero(sh, "move here", "move", "type the nine characters your old device shows", 4),
        weld(sh, 16, 230, 361, 84, 3), split_foot(sh, "done", "back", ("check", "back"))))
    scr(brand, "arrival-check", lambda sh: (hero(sh, "is it you?", "itsme", "the old device shows four characters; are they these?", 4),
        weld(sh, 16, 230, 361, 84, 4), [sh.text(16 + i * 90 + 45, 284, c, 28, sh.k["fg"], 600, "middle") for i, c in enumerate("7F2Q")],
        split_foot(sh, "they match", "no", ("check", "close"))))
    scr(brand, "unlock-wrong", lambda sh: (hero(sh, "welcome back", "unlock", "type your PIN to open this device's vault", 2),
        weld(sh, 16, 230, 361, 72, 6), err(sh, 318, "wrong PIN · 2 tries left"), split_foot(sh, "open", "paper code", ("unlock", "paper"))))
    scr(brand, "blocked-me", lambda sh: (hero(sh, "this account is paused", "block", "the decision and how to appeal are in «decisions»", 4),
        rows(sh, 250, [("scale", "decisions", "why, and the appeal", "fwd"), ("doc", "documents", None, "fwd")])))
    scr(brand, "offer-link", lambda sh: (hero(sh, "an offer's link", "tag", "a venue's offer brought you here; report it if it misleads", 0),
        rows(sh, 250, [("venue", "corner bakery", "−15% · till 11:00")]), split_foot(sh, "open the app", "report", ("next", "flag"))))
    scr(brand, "place", lambda sh: (hero(sh, "where you are", "pin", "now: Limassol, CY", 2),
        foot_at(sh, 230, "where am I", "pin"), field_card(sh, 16, 312, 361, "city", "Лимас"),
        rows(sh, 410, [("pin", "Limassol", "CY"), ("pin", "Limassol (district)", "CY")]),
        field_card(sh, 16, 556, 361, "coordinates from a map", "34.6823, 33.0464", muted=True), foot(sh, "use this point", icon="check")))
    scr(brand, "edit-age", lambda sh: (hero(sh, "your age", "pen", "neighbours see it after a match", 0), field_card(sh, 16, 230, 170, "age", "28", "from 13"), foot(sh, "save", icon="check")))
    # --- feed states
    def feedbar(sh, title="Limassol"):
        k = sh.k
        mark(sh, 32, 40, 32); T(sh, 58, 48, title, 22, k["fg"], 600)
        xs, cw = weld(sh, 233, 18, 144, 44, 2)
        sh.icon(xs[0] + cw / 2 - 12, 28, "pin", k["fg"]); T(sh, xs[1] + cw / 2, 46, "1 km", 14, k["fg"], 600, "middle")
        return 82
    def feedscreen(name, body):
        def d(sh):
            y = feedbar(sh); body(sh, y); chrome(sh, 0)
        scr(brand, name, d)
    feedscreen("feed-empty", lambda sh, y: (empty(sh, y + 60, "nobody here yet", "be the first, or look a little wider"), foot_at(sh, y + 330, "look within 3 km", "pin")))
    feedscreen("feed-loading", lambda sh, y: [box(sh, 16 + (j % 2) * 186, y + (j // 2) * 150, 175, 136, sh.k["surface-2"] if sh.brand == "sosed" else None) for j in range(6)])
    feedscreen("feed-sent", lambda sh, y: (box(sh, 16, y, 361, 64), sh.icon(30, y + 20, "timer", sh.k["fg"]), T(sh, 64, y + 38, "your phrase is being read", 16, sh.k["fg"], 600),
        phrase_tile(sh, 16, y + 80, 361, "walking to the river, join?", 0), phrase_tile(sh, 16, y + 250, 361, "coffee at the corner bakery", 1)))
    feedscreen("feed-refused", lambda sh, y: (err(sh, y, "your phrase was not posted: a phone number"), phrase_tile(sh, 16, y + 70, 361, "walking to the river, join?", 0)))
    feedscreen("feed-table", lambda sh, y: (phrase_tile(sh, 16, y, 361, "walking to the river, join?", 0),
        box(sh, 16, y + 170, 361, 120), sh.icon(32, y + 190, "dots", sh.k["fg"]), T(sh, 66, y + 208, "table «by the park» · dots 3×3", 16, sh.k["fg"], 600),
        weld(sh, 32, y + 226, 329, 44, 3), [T(sh, 32 + i * 110 + 55, y + 254, t, 14, sh.k["fg"], 600, "middle") for i, t in enumerate(("1 playing", "2 watch", "1 free"))]))
    # --- card states
    def cardscreen(name, extra):
        def d(sh):
            k = sh.k; bar(sh, "", right="more")
            fill = sh.tiles[1] if brand == "sosed" else k["surface"]; fg = ink(sh, fill) if brand == "sosed" else k["fg"]
            box(sh, 16, 90, 361, 360, fill)
            for n, l in enumerate(wrap("walking to the river, who's with me? we start at the bridge", 30, 320)): T(sh, 36, 150 + n * 40, l, 28, fg, 600)
            sh.icon(36, 330, "people", fg); T(sh, 66, 348, "with friends · 300 m · 40 min left", 15, fg)
            extra(sh, fg)
        scr(brand, name, d)
    cardscreen("card-393", lambda sh, fg: (split_foot(sh, "like", "hide", ("mk_" + brand, "eyeoff"))))
    cardscreen("card-more", lambda sh, fg: rows(sh, 470, [("eyeoff", "hide", "only from my feed"), ("block", "block", "we stop seeing each other"), ("flag", "report", "against the rules")]))
    cardscreen("card-liked", lambda sh, fg: (like_btn(sh, 56, 410, 40, 6 if brand == "sosed" else 2, ink_=fg), T(sh, 86, 416, "6 · I'm in", 16, fg, 600),
        box(sh, 16, 470, 361, 64), sh.icon(30, 490, "check", sh.k["fg"]), T(sh, 64, 508, "if they say «like» too, it's a match", 15, sh.k["fg"], 600)))
    cardscreen("card-matched", lambda sh, fg: (box(sh, 16, 470, 361, 64, sh.k["accent"]), sh.icon(30, 490, "people", sh.k["accent-fg"]),
        T(sh, 64, 508, "it's a match — offer to talk", 16, sh.k["accent-fg"], 600), foot(sh, "talk", icon="chat")))
    # --- composer
    def composer(name, extra):
        def d(sh):
            k = sh.k; bar(sh, "write")
            box(sh, 16, 90, 361, 180); T(sh, 34, 130, extra[0], 20, k["fg"] if extra[0][0] != "w" or name != "composer-393" else k["fg-muted"], 600)
            T(sh, 359, 254, extra[1], 14, k["fg-muted"], 400, "end")
            chips(sh, 290, [("me", "alone"), ("people", "friends"), ("party", "party")], on=1)
            chips(sh, 366, [(None, "1 h"), (None, "3 h"), (None, "tonight")], on=0)
            if len(extra) > 2: err(sh, 450, extra[2])
            foot(sh, "send", icon="send")
        scr(brand, name, d)
    composer("composer-393", ("what's happening near you…", "140 left"))
    composer("composer-contact", ("call me 99 123 456", "122 left", "a contact: it shows only after a match"))
    composer("composer-limit", ("coffee anyone?", "126 left", "4 of 4 phrases are live — one must fade"))
    # --- likes, inbox, match, chat
    scr(brand, "likes-empty", lambda sh: (bar(sh, "my likes"), empty(sh, 120, "nothing liked yet", "the mark on a phrase says «I'm in»")))
    def inbox(sh):
        bar(sh, "talks", back=False)
        rows(sh, 90, [("people", "Boris", "wants to talk · 23 h", "fwd")])
        rows(sh, 174, [("chat", "Anya", "see you at the bridge", "fwd"), ("chat", "Lena", "thanks for the ladder!", "fwd"), ("chat", "Mark", "is the music on?", "fwd")])
        chrome(sh, 2)
    scr(brand, "inbox-393", inbox)
    scr(brand, "inbox-empty", lambda sh: (bar(sh, "talks", back=False), empty(sh, 120, "no talks yet", "a like, a like back — and an offer to talk"), chrome(sh, 2)))
    def match(name, waiting):
        def d(sh):
            k = sh.k; bar(sh, "a match")
            like_btn(sh, 150, 220, 96, 6 if brand == "sosed" else 2); like_btn(sh, 243, 220, 96, 6 if brand == "sosed" else 2)
            T(sh, 196, 320, "Boris, 31", 28, k["fg"], 600, "middle"); T(sh, 196, 348, "you both said «I'm in»", 15, k["fg-muted"], 400, "middle")
            if waiting: box(sh, 16, 400, 361, 64); sh.icon(30, 420, "timer", k["fg"]); T(sh, 64, 438, "waiting for Boris to agree · 23 h", 15, k["fg"], 600)
            else: split_foot(sh, "talk", "not now", ("chat", "close"))
        scr(brand, name, d)
    match("match-393", False); match("match-waiting", True)
    def chat(name, extra):
        def d(sh):
            k = sh.k; bar(sh, "Anya", right="more")
            y = 96
            for who, t in (("theirs", "hi! at the river already?"), ("mine", "on my way, five minutes")):
                w = len(t) * 9 + 40; x = 377 - w if who == "mine" else 16
                fill = k["accent"] if who == "mine" else k["surface"]
                box(sh, x, y, w, 52, fill); T(sh, x + 18, y + 32, t, 16, k["accent-fg"] if who == "mine" else k["fg"]); y += 66
            extra(sh, y)
        scr(brand, name, d)
    def chat_field(sh):
        xs, cw = weld(sh, 16, 851 - 92, 361, 64, 1); sh.text(36, 851 - 54, "a line…", 16, sh.k["fg-muted"])
        sh.rect(377 - 56, 851 - 86, 48, 52, sh.k["accent"], 24); sh.icon(377 - 44, 851 - 72, "send", sh.k["accent-fg"])
    chat("chat-393", lambda sh, y: (box(sh, 16, y, 361, 44, sh.k["surface-2"] if brand == "sosed" else None), sh.icon(30, y + 10, "timer", sh.k["fg-muted"]),
        T(sh, 62, y + 28, "the talk fades in 6 days", 14, sh.k["fg-muted"]), chat_field(sh)))
    chat("chat-keys", lambda sh, y: (box(sh, 16, y, 361, 64), sh.icon(30, y + 20, "key", sh.k["fg"]), T(sh, 64, y + 38, "agreeing keys with Anya…", 16, sh.k["fg"], 600)))
    chat("chat-actions", lambda sh, y: rows(sh, y, [("timer", "the talk's term", "6 days", "fwd"), ("dots", "a game", None, "fwd"), ("end", "end the talk", None), ("block", "block", None), ("flag", "report", None)]))
    chat("chat-ended", lambda sh, y: (box(sh, 16, y, 361, 64), sh.icon(30, y + 20, "end", sh.k["fg"]), T(sh, 64, y + 38, "the talk ended for both", 16, sh.k["fg"], 600)))
    chat("chat-game", lambda sh, y: (box(sh, 76, y, 240, 240), [sh.a(f'<circle cx="{106 + a * 60}" cy="{y + 30 + b * 60}" r="6" fill="{sh.k["fg"]}"/>') for a in range(4) for b in range(4)],
        T(sh, 196, y + 270, "your move", 16, sh.k["fg"], 600, "middle"), chat_field(sh)))
    # --- tables
    def tables(sh):
        bar(sh, "tables", back=False, right="plus")
        rows(sh, 90, [("dots", "dots 3×3 by the park", "1 playing · 2 watch · 1 free", "fwd"), ("dots", "quick dots", "1 playing · 1 free", "fwd"), ("dots", "yard league", "2 playing · 5 watch", "fwd")])
        chrome(sh, 1)
    scr(brand, "tables-393", tables)
    scr(brand, "tables-empty", lambda sh: (bar(sh, "tables", back=False, right="plus"), empty(sh, 120, "no tables nearby", "open one — neighbours sit down"), chrome(sh, 1)))
    def table(name, extra):
        def d(sh):
            k = sh.k; bar(sh, "by the park", right="more")
            xs, cw = weld(sh, 16, 90, 361, 56, 3)
            for x, t in zip(xs, ("you 2", "Boris 1", "your move")): T(sh, x + cw / 2, 124, t, 15, k["fg"], 600, "middle")
            box(sh, 46, 164, 300, 300)
            for a in range(4):
                for b in range(4): sh.a(f'<circle cx="{76 + a * 80}" cy="{194 + b * 80}" r="7" fill="{k["fg"]}"/>')
            extra(sh)
        scr(brand, name, d)
    table("table-393", lambda sh: split_foot(sh, "leave", "say", ("back", "chat")))
    table("table-applications", lambda sh: (rows(sh, 486, [("hand", "Lena asks to play", None, "check"), ("hand", "Mark asks to play", None, "check")]), foot(sh, "start", icon="next")))
    table("table-watching", lambda sh: (box(sh, 16, 486, 361, 52), sh.icon(30, 500, "eye", sh.k["fg"]), sh.text(64, 518, "watching · 2 more watch", 15, sh.k["fg"], 600), foot(sh, "ask to play", icon="hand")))
    table("table-over", lambda sh: (box(sh, 16, 486, 361, 72, sh.k["accent"]), sh.icon(32, 508, "trophy", sh.k["accent-fg"]), sh.text(66, 528, "you won 5 : 4", 20, sh.k["accent-fg"], 600),
        split_foot(sh, "again", "leave", ("restore", "back"))))
    # --- me
    def me(sh):
        k = sh.k; bar(sh, "me", back=False)
        if brand == "sosed": box(sh, 16, 90, 361, 96, sh.tiles[0]); T(sh, 36, 146, "Anya, 28", 28, ink(sh, sh.tiles[0]), 600)
        else: sh.sticker(60, 138, 40, sh.tiles[3], "me", -6, "#ffffff"); T(sh, 116, 148, "Anya, 28", 22, k["fg"], 600)
        y = 204
        for r in range(3):
            xs, cw = weld(sh, 16, y, 361, 72, 2)
            for x, (ic, t) in zip(xs, ((("palette", "look"), ("globe2", "language")), (("age", "whose phrases"), ("lockok", "PIN")), (("paperplus", "paper code"), ("move", "move")))[r]):
                sh.icon(x + 18, y + 24, ic, k["fg"]); T(sh, x + 52, y + 42, t, 15, k["fg"], 600)
            y += 84
        rows(sh, y, [("pause", "step away", None, "fwd"), ("eyeoff", "hidden", None, "fwd"), ("block", "blocked", None, "fwd"), ("doc", "documents", None, "fwd")])
        chrome(sh, 3)
    scr(brand, "me-393", me)
    # --- wizard
    def wiz(n, title, line, ill):
        def d(sh):
            k = sh.k
            for j in range(4): sh.rect(150 + j * 26, 30, 18 if j != n - 1 else 30, 8, k["accent"] if j < n else k["surface-2"], 4)
            sh.text(361, 40, "skip", 15, k["fg-muted"], 600, "end")
            ill(sh)
            T(sh, 196, 520, title, 28, k["fg"], 600, "middle")
            for m, l in enumerate(wrap(line, 16, 320)[:3]): T(sh, 196, 552 + m * 22, l, 16, k["fg-muted"], 400, "middle")
            foot(sh, "next", icon="next" if n < 4 else "check")
        scr(brand, f"wizard-{n}", d)
    wiz(1, "phrases nearby", "short lines from people around you; they fade on their own",
        lambda sh: [phrase_tile(sh, 46, 90 + j * 150, 300, t, j) for j, t in enumerate(("walking to the river?", "coffee at the bakery", "chess in the yard"))][:2])
    wiz(2, "the mark means «I'm in»", "say it to a phrase; if its author says it back, you can talk",
        lambda sh: (like_btn(sh, 150, 260, 120, 0), like_btn(sh, 250, 260, 120, 6 if brand == "sosed" else 2)))
    wiz(3, "tables and games", "open a table nearby, neighbours sit down and play",
        lambda sh: (box(sh, 96, 120, 200, 200), [sh.a(f'<circle cx="{126 + a * 70}" cy="{150 + b * 70}" r="7" fill="{sh.k["fg"]}"/>') for a in range(3) for b in range(3)]))
    wiz(4, "nothing about you leaves", "no names before a match, no numbers, no ads following you",
        lambda sh: (mark(sh, 196, 260, 160)))
    # --- the venue's cabinet
    def adv(name, body):
        def d(sh):
            k = sh.k; mark(sh, 32, 40, 32); T(sh, 58, 48, "for venues", 20, k["fg"], 600)
            body(sh)
        scr(brand, name, d)
    adv("adv-sign-in", lambda sh: (hero_at(sh, "your venue's cabinet", "venue", "a link comes to your mail; no password", 0, 80), field_card(sh, 16, 300, 361, "mail", "hello@bakery.cy"), foot(sh, "send the link", icon="mail")))
    adv("adv-sent", lambda sh: (hero_at(sh, "the link is in your mail", "mail", "open it on this device within 15 minutes", 1, 80)))
    adv("adv-expired", lambda sh: (hero_at(sh, "the link expired", "timer", "ask for a new one", 4, 80), foot(sh, "ask again", icon="mail")))
    def advtabs(sh, on):
        xs, cw = weld(sh, 16, 80, 361, 52, 2)
        sh.rect(xs[on] + 4, 84, cw - 8, 44, sh.k["accent"], 22)
        for i, (x, t) in enumerate(zip(xs, ("venues", "offers"))): sh.text(x + cw / 2, 112, t, 16, sh.k["accent-fg"] if i == on else sh.k["fg"], 600, "middle")
    adv("adv-venues", lambda sh: (advtabs(sh, 0), rows(sh, 152, [("venue", "corner bakery", "Limassol · checked", "fwd"), ("venue", "harbour café", "Limassol · waiting", "fwd")]), foot(sh, "add a venue", icon="plus")))
    adv("adv-offers", lambda sh: (advtabs(sh, 1), rows(sh, 152, [("tag", "−15% coffee and a croissant", "till 11:00 · 34 visits", "fwd"), ("tag", "−10% lunch", "ended", "fwd")]), foot(sh, "new offer", icon="plus")))
    adv("adv-new-offer", lambda sh: (advtabs(sh, 1), field_card(sh, 16, 152, 361, "what", "coffee and a croissant"),
        chips(sh, 250, [(None, "−10%"), (None, "−15%"), (None, "−20%")], on=1), field_card(sh, 16, 326, 361, "until", "11:00 today"), foot(sh, "publish", icon="check")))


def foot_at(sh, y, label, icon):
    k = sh.k
    if sh.brand == "sosed": sh.rect(16, y, 361, 64, k["accent"], 32)
    else: sh.sticker_rect(16, y, 361, 60, k["accent"], 30)
    sh.icon(196 - 18, y + 12, icon, k["accent-fg"], 1.5)
    return y + 76


ICON["mk_sosed"] = '<path d="M3.5 7.5 H20.5 V18 H10.5 L6.5 21.5 V18 H3.5 Z"/><path d="M15.5 7.5 V3.5 M13.5 4 L17.5 3"/>'
ICON["mk_neighbro"] = '<path d="M12 3 L20 9.5 V18 H11 L7 21.5 V18 H4 V9.5 Z"/><path d="M16 6.25 V3.5 H18 V7.9"/>'
ICON.setdefault("close", '<path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5"/>')


# ---------- the marks sheet: every size the product uses, on every theme of the brand
def marks(brand):
    themes = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "web", "themes", brand)) if f.endswith(".json"))
    cw, ch, cols = 320, 300, 5
    rows = -(-len(themes) // cols)
    W, H = cw * cols + 64, 200 + rows * ch + 40
    sh = Sheet(brand, W, H)
    k0 = sh.k
    sh.text(32, 56, f"{brand} · the mark", 28, w=600)
    sh.text(32, 86, "sizes used: 16 favicon · 32 header · 44 rail · 160 splash (200 from 640, 440 in the poster)", 16, k0["fg-muted"])
    sh.text(32, 110, "colour follows the theme accent; under 3:1 on the ground → ring / fill accent-text (marked ⚑)", 16, k0["fg-muted"])
    for i, th in enumerate(themes):
        t = json.load(open(os.path.join(ROOT, "web", "themes", brand, th + ".json")))["tokens"]
        x, y = 32 + (i % cols) * cw, 140 + (i // cols) * ch
        sh.k = t
        sh.rect(x, y, cw - 24, ch - 24, t["bg"], 20, f'stroke="{k0["line"]}" stroke-width="1"')
        faint = cr(t["accent"], t["bg"]) < 3
        sh.text(x + 16, y + 30, th + (" ⚑" if faint else ""), 16, t["fg"], 600)
        sh.text(x + 16, y + 50, f'accent/bg {cr(t["accent"], t["bg"]):.1f}', 14, t["fg-muted"])
        mark(sh, x + 100, y + 160, 160)
        for j, s in enumerate((44, 32, 16)):
            mark(sh, x + 236, y + 96 + j * 60, s)
            sh.text(x + 262, y + 101 + j * 60, str(s), 14, t["fg-muted"])
    sh.k = k0
    sh.save(f"adaptive-{brand}-marks")


for brand in ("sosed", "neighbro"):
    marks(brand)
    likes(brand)
    for step in (1, 2, 3): s_register_step(brand, step)
    for f in (s_unlock, s_restore, s_likes, s_departure): f(brand)
    draw_rest(brand)
    draw_all(brand)
    for screen in (s_card, s_composer, s_inbox, s_chat, s_tables, s_table, s_me, s_register):
        screen(Sheet(brand, 1440, 900))
    for w in (393, 768, 1440, 2560): feed(brand, w)
    for w in (393, 768, 1440): splash(brand, w)
