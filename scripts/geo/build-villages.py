#!/usr/bin/env python3
"""Cyprus villages for the place picker: GeoNames CY.txt -> app/src/screens/me/villages-cy.json, the shape of cities.json.
Usage: build-villages.py CY.txt cities.json out.json. Abandoned and historic places are left out, and so is any point
within NEAR_KM of a place cities.json already holds under the same name."""
import json, math, re, sys

DROP = {"PPLQ", "PPLH", "PPLW"}
NEAR_KM = 3.0
GREEK = re.compile("[Ͱ-Ͽ]")


def km(a, b, c, d):
    return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))


def build(lines, known):
    best = {}  # one place per name: the biggest, not the first the file lists
    for line in lines:
        f = line.rstrip("\n").split("\t")
        if len(f) < 15 or f[6] != "P" or f[7] in DROP:
            continue
        name, lat, lon = f[1], round(float(f[4]), 4), round(float(f[5]), 4)
        if any(k[0] == name and km(lat, lon, k[2], k[3]) < NEAR_KM for k in known):
            continue
        alts = [a for a in f[3].split(",") if a and a != name]
        keep = ([f[2]] if f[2] != name else []) + [a for a in alts if GREEK.search(a)][:2]
        row = [name, "CY", lat, lon, int(f[14] or 0)] + ([keep] if keep else [])
        if name not in best or row[4] > best[name][4]:
            best[name] = row
    return sorted(best.values(), key=lambda c: (-c[4], c[0]))


def main():
    src, cities, dest = sys.argv[1:4]
    known = [c for c in json.load(open(cities, encoding="utf-8"))["cities"] if c[1] == "CY"]
    rows = build(open(src, encoding="utf-8"), known)
    doc = {"source": "GeoNames CY, CC BY 4.0, https://www.geonames.org/", "fields": ["name", "cc", "lat", "lon", "pop", "alt?"], "cities": rows}
    open(dest, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(len(rows), "places")


if __name__ == "__main__":
    main()
