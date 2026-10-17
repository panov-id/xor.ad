// Where the feed looks: the place the person chose, kept on this device by the web under "place.v1"
// (web/src/geo/place.ts storedPlace) — read here in the same shape, so a place chosen in the web is the place here.
// Until a place is chosen the node reads around Rome, the web's FALLBACK, and the feed says "no place chosen".
// Not here yet: the picker (web screens/Place.tsx), the place QR.
export type Place = { lat: number; lon: number; name: string; chosen: boolean };

const KEY = "place.v1";
const FALLBACK = { lat: 41.9, lon: 12.5 };

export function placeOf(raw: string | null): Place | null {
  try {
    const p = JSON.parse(raw ?? "null");
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name === "string" ? { lat: p.lat, lon: p.lon, name: p.name, chosen: true } : null;
  } catch { return null; }
}

export function storedPlace(): Place {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* a closed store: the fallback */ }
  return placeOf(raw) ?? { ...FALLBACK, name: "", chosen: false };
}
