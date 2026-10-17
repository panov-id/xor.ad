#!/usr/bin/env bash
# The web face speaks only through its dictionaries (W13).
#
# Red when:
#   - a Cyrillic letter stands in web/src code outside web/src/locales — a
#     word typed into a screen instead of a key (comments do not count);
#   - a web dictionary misses a key of the Russian one, has one it lacks, or
#     loses a {placeholder} — the languages are the terminal's seventeen;
#   - a web.* value of a non-Russian dictionary reads as the Russian one, or of
#     a non-English one as the English one, and is not named as truly the same;
#   - a key named in say("…") is in neither the terminal's Russian dictionary
#     nor the web's — a screen would show the key itself.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$root" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
src = root / "web/src"
locales = src / "locales"
depth = root / "depth/ink/locales"
bad = []

def code_only(text: str) -> str:
    # Strings are kept, comments dropped: a // or /* inside a string literal is
    # not a comment, so the scan walks the text once.
    out, i, n = [], 0, len(text)
    quote = None
    while i < n:
        c = text[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1]); i += 2; continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'`":
            quote = c; out.append(c); i += 1; continue
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        out.append(c); i += 1
    return "".join(out)

used = set()
for path in sorted(list(src.rglob("*.ts")) + list(src.rglob("*.tsx"))):
    if locales in path.parents:
        continue
    raw = path.read_text()
    code = code_only(raw)
    for no, line in enumerate(code.splitlines(), 1):
        if re.search(r"[А-Яа-яЁё]", line):
            bad.append(f"{path.relative_to(root)}:{no}: слово на экране мимо словаря: {line.strip()[:80]}")
    used.update(re.findall(r"""\bsay\(\s*["']([\w.]+)["']""", raw))

ru_web = json.loads((locales / "ru.json").read_text())
ru_depth = json.loads((depth / "ru.json").read_text())
langs = sorted(p.stem for p in depth.glob("*.json"))
if len(langs) != 17:
    bad.append(f"языков у терминала {len(langs)}, ожидается 17")
for lang in langs:
    f = locales / f"{lang}.json"
    if not f.exists():
        bad.append(f"нет файла web/src/locales/{lang}.json"); continue
    other = json.loads(f.read_text())
    for k, v in ru_web.items():
        if not str(other.get(k, "")).strip():
            bad.append(f"{lang}: нет ключа {k}"); continue
        if set(re.findall(r"\{(\w+)\}", v)) != set(re.findall(r"\{(\w+)\}", str(other[k]))):
            bad.append(f"{lang}: {k}: подстановки не совпадают с ru")
    for k in other:
        if k not in ru_web:
            bad.append(f"{lang}: лишний ключ {k}")
# P9 (panel 03.10.2026), tightened the same day: every web.* key that reads
# exactly as the Russian in a non-Russian dictionary is red — an untranslated
# copy, whether or not any other language has translated it yet. A word that is
# truly the same in a Cyrillic language (a cognate, a unit, a loanword) is named
# below, per language and per key; anything not named here must differ from ru.
# The list itself lives in scripts/check-locale-ru-copies.allow (G-RU2, 11.10.2026):
# one source for the terminal and the web, rows with side "web" are read here.
SAME_AS_RU = {}
for line in (root / "scripts/check-locale-ru-copies.allow").read_text().splitlines():
    if line.strip() and not line.startswith("#"):
        lang, side, key = line.split("\t")[:3]
        if side == "web":
            SAME_AS_RU.setdefault(lang, set()).add(key)
dicts = {lang: json.loads((locales / f"{lang}.json").read_text())
         for lang in langs if lang != "ru" and (locales / f"{lang}.json").exists()}
for lang, keys in SAME_AS_RU.items():
    for k in sorted(keys):
        if k not in ru_web:
            bad.append(f"{lang}: исключение check-locale-ru-copies.allow на ключ {k}, которого нет в ru")
        elif lang in dicts and dicts[lang].get(k) != ru_web[k]:
            bad.append(f"{lang}: {k} уже не совпадает с ru — убрать из check-locale-ru-copies.allow")
for k, v in ru_web.items():
    if not k.startswith("web."):
        continue
    for lang, d in sorted(dicts.items()):
        if d.get(k) == v and k not in SAME_AS_RU.get(lang, ()):
            bad.append(f"{lang}: {k} осталась русской («{v[:40]}») и не названа в check-locale-ru-copies.allow")
# W15-I18N: the same for English. A non-English dictionary whose web.* value
# reads exactly as en.json's is an untranslated copy (the verifier put the
# English addVenue into de and the gate said nothing). What is truly the same
# in a Latin-script language — a unit, an international word — is named here.
SAME_AS_EN = {
    "az": {
        "web.table.street_flop",  # poker street name, the same word in az
        "web.table.street_river",  # poker street name, the same word in az
        "web.newTable.podkidnoy",  # same word
        "web.newTable.variant",  # same word
        "web.game.poker",  # same word
        "web.game.durak",  # same word
        "web.set.reversi",  # reversi
        "web.cabinet.radius",  # radius, m
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
    },
    "de": {
        "web.card.match.neighbro.kick",  # «II — Match»: the landing's own words in de (neighbro.place/sosed.place landing/index.html s2k)
        "web.sticker.wow",  # same word
        "web.cabinet.link",  # Link: {link}
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
        "web.feed.title",  # Feed
    },
    "el": {
        "web.cabinet.email",  # email
        "web.card.likes",  # likes: — kept as the loanword; worth a translator's look
    },
    "es": {
        "web.card.match.sosed.kick",  # «II — Match»: the landing's own words in es (neighbro.place/sosed.place landing/index.html s2k)
        "web.card.match.neighbro.kick",  # «II — Match»: the landing's own words in es (neighbro.place/sosed.place landing/index.html s2k)
        "web.table.street_flop",  # poker street name, the same word in es
        "web.table.street_turn",  # poker street name, the same word in es
        "web.table.street_river",  # poker street name, the same word in es
        "web.sticker.title",  # same word
        "web.game.durak",  # same word
        "web.set.reversi",  # reversi
        "web.duration.h",  # {n} h
        "web.duration.min",  # {n} min
        "web.card.block_no",  # no
        "web.card.likes",  # likes: — kept as the loanword; worth a translator's look
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
    },
    "fr": {
        "web.card.match.sosed.kick",  # «II — Match»: the landing's own words in fr (neighbro.place/sosed.place landing/index.html s2k)
        "web.card.match.neighbro.kick",  # «II — Match»: the landing's own words in fr (neighbro.place/sosed.place landing/index.html s2k)
        "web.table.street_flop",  # poker street name, the same word in fr
        "web.table.street_turn",  # poker street name, the same word in fr
        "web.table.street_river",  # poker street name, the same word in fr
        "web.sticker.title",  # same word
        "web.game.poker",  # same word
        "web.game.durak",  # same word
        "web.set.reversi",  # reversi
        "web.die.6",  # six
        "web.rank.6",  # six
        "web.duration.h",  # {n} h
        "web.duration.min",  # {n} min
        "web.ui.code",  # code
        "web.nav.tables",  # tables
        "web.card.phrase",  # phrase
        "web.composer.mode",  # mode
        "web.composer.phrase",  # phrase
        "web.composer.zone",  # zone
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
        "web.inbox.chats",  # Conversations
        "web.legal.item",  # documents
        "web.legal.title",  # Documents
        "web.table.direction",  # direction dx dy
    },
    "pl": {
        "web.table.street_flop",  # poker street name, the same word in pl
        "web.table.street_turn",  # poker street name, the same word in pl
        "web.table.street_river",  # poker street name, the same word in pl
        "web.sticker.wow",  # same word
        "web.game.poker",  # same word
        "web.set.reversi",  # reversi
        "web.duration.min",  # {n} min — the abbreviation of a minute is the same
        "web.ui.system",  # system
        "web.cabinet.field.url",  # link
        "web.cabinet.link",  # Link: {link}
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
    },
    "ro": {
        "web.table.street_flop",  # poker street name, the same word in ro
        "web.table.street_turn",  # poker street name, the same word in ro
        "web.table.street_river",  # poker street name, the same word in ro
        "web.game.poker",  # same word
        "web.game.durak",  # same word
        "web.set.reversi",  # reversi
        "web.duration.h",  # {n} h — the abbreviation of an hour is the same
        "web.cabinet.field.text",  # text
        "web.cabinet.field.url",  # link
        "web.cabinet.link",  # Link: {link}
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
        "web.game.set",  # Set
        "web.transfer.browser",  # browser
    },
    "uz": {
        "web.table.street_flop",  # poker street name, the same word in uz
        "web.table.street_river",  # poker street name, the same word in uz
        "web.newTable.variant",  # same word
        "web.game.poker",  # same word
        "web.game.durak",  # same word
        "web.set.reversi",  # reversi
        "web.cabinet.radius",  # radius, m
        "web.feed.km",  # {n} km
        "web.feed.m",  # {n} m
    },
}
en_web = dicts.get("en", {})
for lang, keys in SAME_AS_EN.items():
    for k in sorted(keys):
        if k not in en_web:
            bad.append(f"{lang}: исключение SAME_AS_EN на ключ {k}, которого нет в en")
        elif lang in dicts and dicts[lang].get(k) != en_web[k]:
            bad.append(f"{lang}: {k} уже не совпадает с en — убрать из SAME_AS_EN")
for k, v in en_web.items():
    if not k.startswith("web."):
        continue
    for lang, d in sorted(dicts.items()):
        if lang == "en":
            continue
        if d.get(k) == v and k not in SAME_AS_EN.get(lang, ()):
            bad.append(f"{lang}: {k} осталась английской («{v[:40]}») и не названа в SAME_AS_EN")
# П17: a table's set is shown by a word, never by its id. Every set the screen
# offers (NewTable.tsx CLASSES) needs web.set.<id> in the dictionary (an NxN
# field is one key, web.set.field); the cards and dice the node deals need a
# word for each rank, suit and face (lib/tables_deck.ts, tables_dice.ts).
new_table = (src / "screens/NewTable.tsx").read_text()
set_ids = sorted(set(re.findall(r'"([\w-]+)"', " ".join(re.findall(r"sets: \[([^\]]*)\]", new_table)))))
if not set_ids:
    bad.append("screens/NewTable.tsx: наборов не найдено — разбор CLASSES разошёлся с кодом")
for sid in set_ids:
    if not re.fullmatch(r"(\d+)x\1", sid) and f"web.set.{sid}" not in ru_web:
        bad.append(f"набор «{sid}» показывается своим id: нет ключа web.set.{sid}")
for need in ["web.set.field", "web.table.cardName"] + [f"web.rank.{r}" for r in "6 7 8 9 10 J Q K A".split()] \
        + [f"web.suit.{s}" for s in "SHDC"] + [f"web.die.{n}" for n in range(1, 7)]:
    if need not in ru_web:
        bad.append(f"нет ключа {need} (карта или кость словом)")
for k in sorted(used):
    if k not in ru_web and k not in ru_depth:
        bad.append(f"say(\"{k}\"): такого ключа нет ни у веба, ни у терминала")

for line in bad[:30]:
    print(f"  ✗ {line}")
if len(bad) > 30:
    print(f"  и ещё {len(bad) - 30}")
if bad:
    print(f"нарушений: {len(bad)}", file=sys.stderr); sys.exit(1)
print(f"веб говорит словарями: ключей веба {len(ru_web)}, языков {len(langs)}, названных ключей {len(used)}")
PY
