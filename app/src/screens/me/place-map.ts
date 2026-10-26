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

/** The cities on the view, the biggest first (the list is sorted by population), at most LABELS. */
export function citiesOn(all: City[], c: At, radius: Radius, w: number, h: number): { name: string; x: number; y: number }[] {
  const s = pxPerM(radius, w, h);
  const out: { name: string; x: number; y: number }[] = [];
  for (const city of all) {
    const [x, y] = toView({ lat: city[2], lon: city[3] }, c, s, w, h);
    if (x < 0 || y < 0 || x > w || y > h) continue;
    out.push({ name: city[0], x, y });
    if (out.length === LABELS) break;
  }
  return out;
}

/** The step a pinch lands on: the fingers spread by `ratio`, so the radius shrinks by it; the nearest of RADII. */
export function pinched(radius: Radius, ratio: number): Radius {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return radius;
  const want = Math.log(radius / ratio);
  return RADII.reduce((b, r) => (Math.abs(Math.log(r) - want) < Math.abs(Math.log(b) - want) ? r : b), radius);
}
