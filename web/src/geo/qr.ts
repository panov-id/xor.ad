// The place QR's link (screen 26; sosed.place docs/26-place-qr_RU.md; owner 19.09 and 12.10.2026):
// `<storefront>/location#p=<i>.<j>&s=<step>`. The cell rides in the fragment, which the browser never
// sends: the node and the storefront learn nothing of who made a QR or who opened it.
//
// The cell is a node of the same grid the node publishes a phrase at (relay/node/src/lib/feed_geo.ts
// quantise): step = the zone in metres, anchored at (0°, 0°), the longitude step from the cosine of the
// already-rounded latitude. Two people making a QR for one cell and one step get one and the same link.

export const STEP_METRES = [100, 300, 1000, 3000, 10000] as const;
export type Step = 1 | 2 | 3 | 4 | 5;
export type Point = { lat: number; lon: number };

// One constant with the node's, or the two grids drift apart.
const METRES_PER_DEGREE = 111320;

function lonStep(latQ: number, metres: number): number {
  const cos = Math.cos((latQ * Math.PI) / 180);
  return Math.abs(cos) < 1e-9 ? 0 : metres / (METRES_PER_DEGREE * cos);
}

export function cellOf(p: Point, s: Step): { i: number; j: number } {
  const metres = STEP_METRES[s - 1];
  const dPhi = metres / METRES_PER_DEGREE;
  const i = Math.round(p.lat / dPhi);
  const dLambda = lonStep(i * dPhi, metres);
  return { i, j: dLambda === 0 ? 0 : Math.round(p.lon / dLambda) };
}

export function centreOf(i: number, j: number, s: Step): Point {
  const metres = STEP_METRES[s - 1];
  const lat = i * (metres / METRES_PER_DEGREE);
  return { lat, lon: j * lonStep(lat, metres) };
}

export function qrLink(origin: string, p: Point, s: Step): string {
  const { i, j } = cellOf(p, s);
  return `${origin}/location#p=${i}.${j}&s=${s}`;
}

// Strict: exactly `p` and `s`, in the spec's shapes, and a cell on the globe. Anything else is as if
// there were no QR at all — never NaN into the feed.
export function parseQr(hash: string): (Point & { s: Step }) | null {
  const m = /^#?p=(-?\d{1,6})\.(-?\d{1,7})&s=([1-5])$/.exec(hash);
  if (!m) return null;
  const s = Number(m[3]) as Step;
  const at = centreOf(Number(m[1]), Number(m[2]), s);
  if (!Number.isFinite(at.lat) || !Number.isFinite(at.lon) || Math.abs(at.lat) > 90 || Math.abs(at.lon) > 180) return null;
  return { ...at, s };
}
