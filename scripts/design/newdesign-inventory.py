#!/usr/bin/env python3
"""Inventory of the sosed redesign (docs/newdesing2, 25.10.2026) against the app's code.

Reads every screen id from screens.csv inside the colour archive (the skeleton plus the two screens added 26.10) and
maps each to the app file that draws it today, or to «new» when no screen exists. Fails when an archive id has no
row in MAP (a screen added to the mockups and forgotten here), when MAP names an id the archive does not have, or when
a mapped file is missing on disk. Writes docs/newdesign/inventory.csv.

    python3 -I scripts/design/newdesign-inventory.py            # check + write
    python3 -I scripts/design/newdesign-inventory.py --check    # check only
"""
import csv
import html
import io
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "docs/newdesing2/sosed-white-2026-10-25.zip"
OUT = ROOT / "docs/newdesign/inventory.csv"
CSV_MAX = 1_000_000  # screens.csv of 25.10 is ~40 KB
S = "app/src/screens/"

# id -> (code file or "", status). status: keep = exists, restyle; change = exists, mechanics change; new = no screen.
MAP = {
    # 1-entry
    "splash-lang": (S + "Splash.tsx", "keep"), "splash": (S + "Splash.tsx", "keep"),
    "register-1": (S + "Register.tsx", "keep"), "register-2": (S + "Register.tsx", "change"),
    "register-2b": (S + "Register.tsx", "new"), "register-3": (S + "Register.tsx", "keep"),
    "unlock": (S + "Unlock.tsx", "change"), "unlock-error": (S + "Unlock.tsx", "keep"),
    # today a second tap on the same spot forgets (Unlock.tsx:68-70); the mockup makes it its own screen
    "forget-confirm": (S + "Unlock.tsx", "change"), "locked": (S + "Locked.tsx", "keep"),
    "restore": (S + "Gate.tsx", "keep"), "arrival-1": (S + "Arrival.tsx", "keep"),
    "arrival-2": (S + "Arrival.tsx", "keep"), "arrival-3": (S + "Arrival.tsx", "keep"),
    "loading": (S + "Loading.tsx", "keep"),
    # 2-intro
    # «how it works» 1-5: no screen in app/ (grep wizard: only the new-table wizard and Me.tsx:10 «not here yet»)
    "wizard-1": ("", "new"), "wizard-2": ("", "new"), "wizard-3": ("", "new"),
    "wizard-4": ("", "new"), "wizard-5": ("", "new"),
    "place": (S + "me/Place.tsx", "keep"), "place-qr": (S + "me/PlaceQr.tsx", "keep"),
    # 3-nearby
    "feed": (S + "Feed.tsx", "change"), "feed-own": (S + "Feed.tsx", "keep"), "feed-loading": (S + "Feed.tsx", "keep"),
    "feed-empty": (S + "Feed.tsx", "keep"), "feed-error": (S + "Feed.tsx", "keep"), "feed-hidden": (S + "Feed.tsx", "keep"),
    "feed-blocked": (S + "Feed.tsx", "keep"), "radius": (S + "Feed.tsx", "change"),
    "my-marks": (S + "talks/Likes.tsx", "change"), "my-marks-empty": (S + "talks/Likes.tsx", "change"),
    "card": (S + "feed-card.tsx", "change"), "card-in": (S + "feed-card.tsx", "keep"),
    "card-both": (S + "feed-card.tsx", "keep"), "card-need": (S + "feed-card.tsx", "keep"),
    "card-more": (S + "feed-menu.tsx", "keep"), "block-confirm": (S + "feed-menu.tsx", "new"),
    "notice": (S + "feed-menu.tsx", "keep"), "notice-sent": (S + "feed-menu.tsx", "keep"),
    "composer": (S + "Composer.tsx", "keep"), "composer-refused": (S + "Composer.tsx", "keep"),
    "composer-offer": (S + "Composer.tsx", "keep"), "offer-card": (S + "feed-card.tsx", "keep"),
    "offer-exit": (S + "Offer.tsx", "keep"),
    # 4-tables
    "tables": (S + "tables/Tables.tsx", "keep"), "tables-mine": (S + "tables/Tables.tsx", "keep"),
    "tables-full": (S + "tables/Tables.tsx", "keep"), "tables-empty": (S + "tables/Tables.tsx", "keep"),
    "new-table-1": (S + "tables/NewTable.tsx", "keep"), "new-table-2": (S + "tables/NewTable.tsx", "keep"),
    "new-table-3": (S + "tables/NewTable.tsx", "keep"), "table": (S + "tables/Table.tsx", "keep"),
    "table-wait": (S + "tables/Table.tsx", "keep"), "table-more": (S + "tables/Table.tsx", "change"),
    "table-over": (S + "tables/Table.tsx", "new"), "table-solo": (S + "tables/solo.tsx", "change"),
    "table-solo-over": (S + "tables/solo.tsx", "new"), "tables-row-solo": (S + "tables/table-row.tsx", "change"),
    "table-solo-guest": (S + "tables/solo.tsx", "new"),
    "table-pass-confirm": (S + "tables/Table.tsx", "new"), "table-giveup-confirm": (S + "tables/Table.tsx", "new"),
    # 5-talks
    "inbox": (S + "talks/Inbox.tsx", "keep"), "inbox-empty": (S + "talks/Inbox.tsx", "keep"),
    "offer": (S + "talks/Match.tsx", "keep"), "offer-waiting": (S + "talks/MatchWaiting.tsx", "keep"),
    "offer-gone": (S + "talks/Match.tsx", "keep"), "chat": (S + "Chat.tsx", "keep"),
    "chat-more": (S + "chat-menu.tsx", "keep"), "chat-fade": (S + "Chat.tsx", "change"),
    "chat-game": (S + "chat-game.tsx", "keep"), "chat-game-offer": (S + "chat-game.tsx", "keep"),
    "chat-game-board": (S + "chat-game.tsx", "keep"), "chat-safety": (S + "Chat.tsx", "keep"),
    "chat-keys": (S + "Chat.tsx", "keep"), "chat-end-confirm": (S + "chat-menu.tsx", "new"),
    "chat-ended": (S + "Chat.tsx", "keep"),
    # 6-me
    "me": (S + "me/Me.tsx", "change"), "me-restrict": (S + "me/Me.tsx", "keep"),
    "me-profile": (S + "me/Me.tsx", "new"), "edit-name": (S + "me/EditName.tsx", "keep"),
    "edit-age": (S + "me/EditName.tsx", "change"), "theme": (S + "me/Theme.tsx", "change"),
    "lang": (S + "me/LangPicker.tsx", "change"), "me-visibility": (S + "me/Me.tsx", "new"),
    "age-filter": (S + "me/AgeFilter.tsx", "keep"), "hidden": (S + "me/Hidden.tsx", "keep"),
    "blocked": (S + "me/Blocked.tsx", "keep"), "me-security": (S + "me/Me.tsx", "new"),
    "change-pin": (S + "me/ChangePin.tsx", "change"), "reissue-1": (S + "me/Reissue.tsx", "keep"),
    "reissue-2": (S + "me/Reissue.tsx", "keep"), "departure-1": (S + "Departure.tsx", "keep"),
    "departure-2": (S + "Departure.tsx", "keep"), "departure-3": (S + "Departure.tsx", "keep"),
    "departure-done": (S + "Departure.tsx", "keep"), "step-away": (S + "me/StepAway.tsx", "keep"),
    "away": (S + "Away.tsx", "keep"), "legal": (S + "me/Legal.tsx", "keep"),
    "statements": (S + "me/Statements.tsx", "keep"), "reset": (S + "me/Reset.tsx", "keep"),
    # 7-cabinet
    "cab-sign-in": (S + "cabinet/SignIn.tsx", "keep"), "cab-sent": (S + "cabinet/SignIn.tsx", "keep"),
    "cab-expired": (S + "cabinet/SignIn.tsx", "keep"), "cab-venues": (S + "cabinet/Venues.tsx", "keep"),
    "cab-verify": (S + "cabinet/Venues.tsx", "keep"), "cab-new-offer": (S + "cabinet/Offers.tsx", "keep"),
    "cab-preview": (S + "cabinet/Offers.tsx", "keep"), "cab-offers": (S + "cabinet/Offers.tsx", "keep"),
}
GAMES = {"dots": "boards.tsx", "checkers": "boards.tsx", "chess": "boards.tsx", "reversi": "boards.tsx",
         "four": "boards.tsx", "durak": "cards.tsx", "poker": "boards-poker.tsx", "hangman": "boards.tsx",
         "tavli": "boards-physics.tsx", "domino": "boards-deck.tsx", "chapayev": "boards-physics.tsx",
         "battleship": "boards-sea.tsx"}
for g, f in GAMES.items():
    for st in ("wait", "turn"):
        MAP[f"{g}-{st}"] = (S + "tables/" + f, "keep")
    MAP[f"{g}-over"] = (S + "tables/Table.tsx", "new")
MAP.update({"battleship-place": (S + "tables/boards-sea.tsx", "keep"), "hangman-word": (S + "tables/boards.tsx", "keep"),
            "poker-bet": (S + "tables/boards-poker.tsx", "change")})


def archive_rows(path=ARCHIVE):
    z = zipfile.ZipFile(path)
    name = next(n for n in z.namelist() if n.endswith("screens.csv"))
    if z.getinfo(name).file_size > CSV_MAX:  # a crafted archive must not unpack gigabytes into memory (panel 26.10)
        raise SystemExit(f"inventory: {name} is over {CSV_MAX} bytes")
    rows = list(csv.reader(io.StringIO(z.read(name).decode("utf-8-sig"))))
    head = [h.strip().lower() for h in rows[0]]
    return head, rows[1:]


def screens(path=ARCHIVE):
    """{id: (zone, title, widths)} read from the archive's screens.csv."""
    head, rows = archive_rows(path)
    col = {h: i for i, h in enumerate(head)}
    ci = next(col[k] for k in ("id", "screen_id") if k in col)
    cz = next((col[k] for k in ("zone", "зона") if k in col), None)
    ct = next((col[k] for k in ("title", "name", "название", "экран") if k in col), None)
    cw = next((col[k] for k in ("width", "ширина") if k in col), None)
    out = {}
    for r in rows:
        if not r or len(r) <= ci:
            continue
        sid = r[ci].strip()
        zone, title, width = (r[cz] if cz is not None else ""), (r[ct] if ct is not None else ""), (r[cw] if cw is not None else "")
        z, t, ws = out.get(sid, (zone, title, set()))
        ws.add(width)
        out[sid] = (z, t, ws)
    return out


def problems(ids, mapping=MAP, root=ROOT):
    errs = [f"in archive, not in MAP: {i}" for i in sorted(set(ids) - set(mapping))]
    errs += [f"in MAP, not in archive: {i}" for i in sorted(set(mapping) - set(ids))]
    errs += [f"missing file for {i}: {f}" for i, (f, _) in sorted(mapping.items()) if f and not (root / f).exists()]
    return errs


MAP_SVG = ROOT / "docs/newdesign/flow-map.svg"
ZONES = [("1-entry", "Вход · Entry"), ("2-intro", "Знакомство · Intro"), ("3-nearby", "Рядом · Nearby"),
         ("4-tables", "Столы · Tables"), ("5-talks", "Беседы · Talks"), ("6-me", "Я · Me"),
         ("7-cabinet", "Кабинет · Cabinet"), ("8-games", "Игры · Games")]
FILL = {"keep": "#e7f5ec", "change": "#fff1d6", "new": "#ffe1dc"}
EDGE = {"keep": "#10b981", "change": "#f59e0b", "new": "#e35e45"}
# the paths between zones a person walks (README «Зоны», shell/App.tsx): entry -> intro -> nearby, the four tabs, tables -> games
FLOWS = [("1-entry", "2-intro"), ("2-intro", "3-nearby"), ("3-nearby", "4-tables"), ("3-nearby", "5-talks"),
         ("3-nearby", "6-me"), ("4-tables", "8-games"), ("5-talks", "8-games")]


def map_svg(sc):
    """One column per zone, one box per screen id coloured by status; arrows for FLOWS between zone heads."""
    col_w, box_h, top, gap = 230, 22, 90, 4
    by = {z: sorted(i for i in sc if sc[i][0] == z) for z, _ in ZONES}
    height = top + max(len(v) for v in by.values()) * (box_h + gap) + 60
    x0 = {z: 20 + k * (col_w + 20) for k, (z, _) in enumerate(ZONES)}
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{20 + len(ZONES) * (col_w + 20)}" height="{height}" '
           'font-family="Golos Text, sans-serif" font-size="12">',
           '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           '<path d="M0 0L10 5L0 10z" fill="#6a6d75"/></marker></defs>',
           '<rect width="100%" height="100%" fill="#ffffff"/>',
           '<text x="20" y="24" font-size="18" font-weight="700">sosed · новый дизайн 25.10 → app/ · '
           f'{len(sc)} экранов</text>',
           '<text x="20" y="44" fill="#6a6d75">зелёный = есть, перекрасить · жёлтый = меняется механика · '
           'красный = экрана нет; стрелки — переходы между зонами</text>']
    for a, b in FLOWS:
        xa, xb = x0[a] + col_w / 2, x0[b] + col_w / 2
        out.append(f'<path d="M{xa} 62 C{xa} 52,{xb} 52,{xb} 62" fill="none" stroke="#6a6d75" marker-end="url(#a)"/>')
    for z, label in ZONES:
        x = x0[z]
        n = Counter(MAP[i][1] for i in by[z])
        out.append(f'<text x="{x}" y="80" font-weight="700">{label} · {len(by[z])} '
                   f'({n["keep"]}/{n["change"]}/{n["new"]})</text>')
        for k, i in enumerate(by[z]):
            st = MAP[i][1]
            y = top + k * (box_h + gap)
            code = html.escape(MAP[i][0].rsplit("/", 1)[-1] or "—")
            out.append(f'<g data-id="{html.escape(i)}"><rect x="{x}" y="{y}" width="{col_w}" height="{box_h}" rx="6" '
                       f'fill="{FILL[st]}" stroke="{EDGE[st]}"/><text x="{x + 6}" y="{y + 15}">{html.escape(i)}</text>'
                       f'<text x="{x + col_w - 6}" y="{y + 15}" text-anchor="end" fill="#6a6d75">{code}</text></g>')
    out.append("</svg>")
    return "\n".join(out)


def cell(v):
    """A CSV cell a spreadsheet will not run: a leading = + - @ becomes text (panel 26.10, CSV injection)."""
    return "'" + v if v[:1] in ("=", "+", "-", "@") else v


def main():
    extra = [a for a in sys.argv[1:] if a != "--check"]
    if extra:
        print(f"inventory: unknown argument {' '.join(extra)}; only --check")
        return 2
    sc = screens()
    errs = problems(sc)
    for e in errs:
        print("inventory:", e)
    if errs:
        return 1
    counts = Counter(st for _, st in MAP.values())
    print(f"inventory: {len(sc)} of {len(sc)} screen ids mapped; " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if "--check" not in sys.argv:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with OUT.open("w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["id", "zone", "title", "widths", "status", "code"])
            for i in sorted(sc, key=lambda k: (sc[k][0], k)):
                z, t, ws = sc[i]
                w.writerow([cell(v) for v in (i, z, t, " ".join(sorted(x for x in ws if x)), MAP[i][1], MAP[i][0])])
        print(f"inventory: wrote {OUT.relative_to(ROOT)}")
        MAP_SVG.write_text(map_svg(sc))
        print(f"inventory: wrote {MAP_SVG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
