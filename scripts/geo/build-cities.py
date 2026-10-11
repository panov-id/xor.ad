#!/usr/bin/env python3
# The web's offline city list (owner 11.10.2026: «a small list of cities, in English; a name typed in one's own
# language is found by its transcription»). Source: GeoNames cities15000 (CC BY 4.0, https://www.geonames.org/),
# cities of 15 000 people and more. Kept: the English (ASCII) name, a few Latin alternates (Moskva for Moscow),
# the country code, the point rounded to 4 places (~11 m), the population for ranking.
#   scripts/geo/build-cities.sh   (downloads into a scratch dir, then runs this)
#   python3 scripts/geo/build-cities.py <cities15000.txt> <out.json>
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
LATIN = re.compile(r"^[A-Za-z][A-Za-z .'\-]{1,40}$")
rows = []
for line in open(src, encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15: continue
    ascii_name, alts, lat, lon, cc, pop = f[2], f[3], float(f[4]), float(f[5]), f[8], int(f[14] or 0)
    if not ascii_name: continue
    key = ascii_name.lower()
    extra = []
    for a in alts.split(","):
        a = a.strip()
        # codes like «MOW» are no names a person types; native Latin spellings (Moskva, Lemesos) are
        if LATIN.match(a) and not a.isupper() and len(a) >= 4 and a.lower() != key and a.lower() not in (e.lower() for e in extra):
            extra.append(a)
        if len(extra) >= 4: break
    rows.append([ascii_name, cc, round(lat, 4), round(lon, 4), pop] + ([extra] if extra else []))
rows.sort(key=lambda r: -r[4])
json.dump({"source": "GeoNames cities15000, CC BY 4.0, https://www.geonames.org/", "fields": ["name", "cc", "lat", "lon", "pop", "alt?"],
           "cities": rows}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(rows), "cities")
