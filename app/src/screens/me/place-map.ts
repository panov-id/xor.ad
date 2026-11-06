// The place map's pure part (docs/newsdesign/place-flow.svg, step 2): our own map, no map service. Land comes as
// 1°x1° tiles built by scripts/geo/build-land.sh (Natural Earth, app/public/geo/<lat>_<lon>.json, rings in
// thousandths of a degree from the tile's south-west corner; a cell with no land has no file); cities are the
// device's list (GeoNames, cities.ts). The view is a local flat projection around the centre: fine up to 10 km.
import type { Radius } from "@sdk/client.ts";
import type { City } from "@sdk/place.ts";
import { RADII } from "../feed-logic.ts";

const M_PER_DEG = 111_320;
/** The view shows the circle with room around it: half the view's short side is radius × VIEW. */
export const VIEW = 1.6;
/** Natural Earth draws the coast of Cyprus in runs of about 3 km (measured 24.10): below that the land is noise. */
export const LAND_FROM: Radius = 3000;
/** How many neighbour cities carry a label (the sheet draws six around the centre). */
export const LABELS = 6;

export type At = { lat: number; lon: number };
export type Tile = { r: number[][] };

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Pixels per metre, so that radius × VIEW fills half the view's short side. */
export function pxPerM(radius: Radius, w: number, h: number): number {
  return Math.min(w, h) / 2 / (radius * VIEW);
}

/** A point of the world on the view, the centre in the middle; y grows down. */
export function toView(p: At, c: At, scale: number, w: number, h: number): [number, number] {
  const k = Math.cos((c.lat * Math.PI) / 180);
  return [w / 2 + wrap(p.lon - c.lon) * k * M_PER_DEG * scale, h / 2 - (p.lat - c.lat) * M_PER_DEG * scale];
}

/** The centre after the map was dragged by dx, dy pixels: the world follows the finger, so the centre goes the other way. */
export function dragged(c: At, dx: number, dy: number, scale: number): At {
  const k = Math.cos((c.lat * Math.PI) / 180);
  return { lat: Math.max(-85, Math.min(85, c.lat + dy / scale / M_PER_DEG)), lon: wrap(c.lon - dx / scale / M_PER_DEG / k) };
}

/** The tile keys the view touches, none below LAND_FROM (the map then draws cities and the circle only). */
export function tilesFor(c: At, radius: Radius, w: number, h: number): string[] {
  if (radius < LAND_FROM) return [];
  const s = pxPerM(radius, w, h);
  const k = Math.max(0.01, Math.cos((c.lat * Math.PI) / 180));
  const dLat = h / 2 / s / M_PER_DEG, dLon = w / 2 / s / M_PER_DEG / k;
  const keys: string[] = [];
  for (let y = Math.floor(c.lat - dLat); y <= Math.floor(c.lat + dLat); y++) {
    if (y < -90 || y > 89) continue;
    for (let x = Math.floor(c.lon - dLon); x <= Math.floor(c.lon + dLon); x++) keys.push(`${y}_${wrap(x)}`);
  }
  return keys;
}

/** One tile as an SVG path on the view (fill-rule evenodd: a lake is a ring too). */
export function tilePath(key: string, t: Tile, c: At, scale: number, w: number, h: number): string {
  const [y0, x0] = key.split("_").map(Number);
  return t.r.map((ring) => {
    let d = "";
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const [px, py] = toView({ lat: y0 + ring[i + 1] / 1000, lon: x0 + ring[i] / 1000 }, c, scale, w, h);
      d += `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
    }
    return d ? d + "Z" : "";
  }).join("");
}

/** The cities and villages together, the biggest first; a name both hold at the same point stays once. */
export function mergePlaces(cities: City[], villages: City[]): City[] {
  const seen = new Set(cities.map((p) => `${p[0]}|${p[2]}|${p[3]}`));
  return [...cities, ...villages.filter((p) => !seen.has(`${p[0]}|${p[2]}|${p[3]}`))].sort((a, b) => b[4] - a[4]);
}

/** Every place on the view as a point, the biggest first (the list is sorted by population); the first LABELS carry their name. */
export function citiesOn(all: City[], c: At, radius: Radius, w: number, h: number): { name: string; x: number; y: number; label: boolean }[] {
  const s = pxPerM(radius, w, h);
  const out: { name: string; x: number; y: number; label: boolean }[] = [];
  for (const city of all) {
    const [x, y] = toView({ lat: city[2], lon: city[3] }, c, s, w, h);
    if (x < 0 || y < 0 || x > w || y > h) continue;
    out.push({ name: city[0], x, y, label: out.length < LABELS });
  }
  return out;
}

/** The step a pinch lands on: the fingers spread by `ratio`, so the radius shrinks by it; the nearest of RADII. */
export function pinched(radius: Radius, ratio: number): Radius {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return radius;
  const want = Math.log(radius / ratio);
  return RADII.reduce((b, r) => (Math.abs(Math.log(r) - want) < Math.abs(Math.log(b) - want) ? r : b), radius);
}

/** Metres between two points (equirectangular: enough at the map's scale). */
export function metres(a: At, b: At): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lat - b.lat) * M_PER_DEG, (a.lon - b.lon) * M_PER_DEG * k);
}

/** Is the point inside the land of these tiles (even-odd over every ring: a lake is a hole). */
export function onLand(p: At, land: { key: string; t: Tile }[]): boolean {
  let inside = false;
  for (const { key, t } of land) {
    const [y0, x0] = key.split("_").map(Number);
    const x = (p.lon - x0) * 1000, y = (p.lat - y0) * 1000;
    for (const ring of t.r) {
      for (let i = 0, j = ring.length - 2; i + 1 < ring.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

/** How far a city may be and still name the place (docs/newdesign4 screen 27 «3 km around you»): the circle, at least 10 km. */
export const CITY_NEAR_M = 10_000;

/** Which line goes under the radius (docs/newdesign4 screens 23, 26, 27): over the sea (26) only when every tile of the
 * view came back and the pin is off all land; «around you» (27) when no city is near; otherwise «near» — also when
 * the land failed to load (28): not knowing is not the sea. */
export function nearKind(sea: boolean | null, cityM: number | null, radius: Radius): "near" | "sea" | "none" {
  if (cityM === null || cityM > Math.max(radius, CITY_NEAR_M)) return "none";
  return sea === true ? "sea" : "near";
}
