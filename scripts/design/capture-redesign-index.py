#!/usr/bin/env python3
"""index_RU.md / index_EN.md of a redesign capture: counts, every screen with links, what was not captured."""
import sys, collections
from pathlib import Path

out = Path(sys.argv[1])
rows = [l.rstrip("\n").split("\t") for l in (out / "results.tsv").read_text().splitlines() if l.strip()] if (out / "results.tsv").exists() else []
rows = [r + [""] * (6 - len(r)) for r in rows]  # brand locale width screen status reason
# A package may be added to (CAP_APPEND=1): one row per brand/locale/width/screen, the last wins, but an opened screen is kept over a later failure.
_by = {}
for r in rows:
    k = tuple(r[:4])
    if k not in _by or r[4] == "ok" or _by[k][4] != "ok": _by[k] = r
rows = list(_by.values())
ok = [r for r in rows if r[4] == "ok"]
bad = [r for r in rows if r[4] != "ok"]
cnt = collections.defaultdict(lambda: [0, 0])
for b, l, w, s, st, _ in rows:
    cnt[(b, l, int(w))][1] += 1
    if st == "ok": cnt[(b, l, int(w))][0] += 1
size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
files = sum(1 for f in out.rglob("*.png"))

T = {
 "ru": dict(h="Пакет для редизайна", d="Живые стенды (sosed :4173, neighbro :4183, кабинеты :4174/:4184) с засеянными данными Лимассола; человек зарегистрирован в Лимассоле (place.v1 34.6823, 33.0464). Формат: `<brand>/<locale>/<width>/<screen>.{png,html,json}`; тёмная тема — `<screen>.dark.*` (en: все ширины; ru: только 1440).",
   c="Счётчики (экранов открылось из снятых попыток)", nc="Не снято", nw="Не снято по замыслу",
   notes=["PNG — вся высота страницы (fullPage); если экран листается внутри собственного контейнера, а не страницы, в кадр попадает только видимая часть. Полный текст — в `.html` и `.json`.",
          "JSON-боксы: x,y — координаты в странице при положении прокрутки на момент съёмки; только видимые элементы.",
          "Тёмная тема: en — все 5 ширин, ru — только 1440.",
          "Остальные 15 языков — только на 375 и только экраны Splash, Register-1, Feed, Card, Composer, Me, Chat (таблица переполнений — в brief/00-index_RU.md).",
          "Кабинет заведения: новое заведение и новый адрес на каждую прогулку (`redesign <brand> <locale> <width>`). Письмо входа читается из Mailpit стенда sosed.",
          "Экраны, которых нет в списке (оплата, модерация, панель, блог, лендинг), не входят в веб-лицо и не снимались."],
   cols="экран"),
 "en": dict(h="Redesign package", d="Live stands (sosed :4173, neighbro :4183, cabinets :4174/:4184) with seeded Limassol data; the walking person is registered in Limassol (place.v1 34.6823, 33.0464). Layout: `<brand>/<locale>/<width>/<screen>.{png,html,json}`; dark theme `<screen>.dark.*` (en: all widths; ru: 1440 only).",
   c="Counts (screens opened of screens attempted)", nc="Not captured", nw="Not captured by design",
   notes=["PNG is the full page height (fullPage); a screen that scrolls inside its own container rather than the page shows only the visible part. Full text is in `.html` and `.json`.",
          "JSON boxes: x,y are page coordinates at the scroll position of the shot; visible elements only.",
          "Dark theme: en at all 5 widths, ru at 1440 only.",
          "The other 15 locales: 375 only and only Splash, Register-1, Feed, Card, Composer, Me, Chat (overflow table in brief/00-index_EN.md).",
          "Venue cabinet: a new address and venue per walk (`redesign <brand> <locale> <width>`). The sign-in letter is read from the sosed stand's Mailpit.",
          "Screens outside the web face (payments, moderation, panel, blog, landing) are not part of it and were not shot."],
   cols="screen"),
}

def write(lang, name):
    t = T[lang]
    L = [f"# {t['h']} — {out.name}", "", t["d"], "", f"{t['c']}:", "", "| brand | locale | width | ok / attempted |", "|---|---|---|---|"]
    for (b, l, w), (a, n) in sorted(cnt.items()):
        L.append(f"| {b} | {l} | {w} | {a} / {n} |")
    L += ["", f"Total: {len(ok)} of {len(rows)} attempts opened; {files} PNG; {size/1e6:.0f} MB on disk.", "", f"## {t['nc']}", ""]
    if bad:
        L += ["| brand | locale | width | screen | why |", "|---|---|---|---|---|"] + [f"| {b} | {l} | {w} | {s} | {why.replace('|', '/')} |" for b, l, w, s, _, why in bad]
    else:
        L.append("-")
    L += ["", f"## {t['nw']}", ""] + [f"- {n}" for n in t["notes"]]
    L += ["", f"## {t['cols']}", ""]
    by = collections.defaultdict(list)
    for b, l, w, s, st, _ in ok: by[(b, l, int(w))].append(s)
    for (b, l, w), ss in sorted(by.items()):
        L.append(f"### {b} / {l} / {w}")
        for s in ss:
            d = f"{b}/{l}/{w}/{s}"
            extra = f" · [dark]({d}.dark.png)" if (out / f"{d}.dark.png").exists() else ""
            L.append(f"- {s}: [png]({d}.png) · [html]({d}.html) · [json]({d}.json){extra}")
        L.append("")
    (out / name).write_text("\n".join(L) + "\n")

write("ru", "index_RU.md")
write("en", "index_EN.md")
print(f"index: {len(ok)} of {len(rows)} opened, {files} PNG, {size/1e6:.0f} MB")
