// The two pieces of arithmetic the feed stands on: the grid a phrase's centre is
// rounded to before it goes outside, and the age band that decides who sees whom.
//
// Both are small and both are the kind of small that is wrong silently, so they
// live here with their reasons rather than inline in a query.

// Metres per degree of latitude. One constant, used by the rounding and by the
// distance check, because two constants would mean two grids.
const METRES_PER_DEGREE = 111320;

export interface Point {
  lat: number;
  lon: number;
}

// The grid node a phrase's centre is published at (§8.3, written down
// 2026-08-31 "because the naive implementation cancels this whole paragraph").
//
// The step is the phrase's own radius, so everybody who published with the same
// radius inside one cell hands out the **same** coordinates and equality stops
// being a mark. The grid is anchored at (0°, 0°).
//
// **The cosine is taken from the already-rounded latitude.** Take it from the
// exact one and the longitude step becomes a function of an unpublished value —
// which is the whole of what the rounding exists to prevent, undone in one
// character. That is why this is a function with a comment and not an
// expression inside a SELECT.
export function quantise(point: Point, radiusMetres: number): Point {
  const dPhi = radiusMetres / METRES_PER_DEGREE;
  const latQ = Math.round(point.lat / dPhi) * dPhi;
  const cos = Math.cos((latQ * Math.PI) / 180);
  // At the poles the cosine vanishes and the longitude step would be infinite.
  // A phrase there rounds to the meridian it is on rather than to nothing.
  const dLambda = Math.abs(cos) < 1e-9 ? 0 : radiusMetres / (METRES_PER_DEGREE * cos);
  const lonQ = dLambda === 0 ? 0 : Math.round(point.lon / dLambda) * dLambda;
  return { lat: latQ, lon: lonQ };
}

// A cheap metre distance between two points: the latitude difference straight,
// the longitude difference scaled by the cosine of the mid-latitude. Good to a
// fraction of a percent at the distances this product deals in (tens of
// kilometres), and it uses the same constant as the grid above so the two
// cannot drift apart.
export function metresBetween(a: Point, b: Point): number {
  const midLat = ((a.lat + b.lat) / 2 * Math.PI) / 180;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE * Math.cos(midLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// The box a query can use before measuring anything: cheap, index-friendly, and
// deliberately generous — it only has to contain the circle, and the distance
// check that follows is what decides.
export function boundingBox(centre: Point, radiusMetres: number): {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
} {
  const dLat = radiusMetres / METRES_PER_DEGREE;
  const cos = Math.cos((centre.lat * Math.PI) / 180);
  const dLon = Math.abs(cos) < 1e-9 ? 180 : radiusMetres / (METRES_PER_DEGREE * cos);
  return {
    latMin: centre.lat - dLat,
    latMax: centre.lat + dLat,
    lonMin: centre.lon - dLon,
    lonMax: centre.lon + dLon,
  };
}

// The age band (§8.2/§8.3). Two worlds that touch at the edge:
//
//   A ≤ 20 → [max(13, A-2), A+2]    the sandbox
//   A ≥ 21 → [min(21, A-2), ∞)      the adult pool
//
// The boundary is soft on purpose — a twenty-year-old sees [18, 22] and a
// twenty-one-year-old [19, ∞), so they meet — and the thing it protects is
// still intact: to reach the adult pool a teenager needs A+2 ≥ 21, so everybody
// under 19 is cut off from 21+ entirely.
export function band(age: number): { low: number; high: number | null } {
  if (age <= 20) return { low: Math.max(13, age - 2), high: age + 2 };
  return { low: Math.min(21, age - 2), high: null };
}

// **Symmetrically**, and that is not a nicety: asymmetry would mean one person
// liking a phrase the other cannot see in their own feed, so the match could
// never happen and the like would go nowhere (§8.3).
export function visibleToEachOther(mine: number, theirs: number): boolean {
  const ours = band(mine);
  const yours = band(theirs);
  const inOurs = theirs >= ours.low && (ours.high === null || theirs <= ours.high);
  const inYours = mine >= yours.low && (yours.high === null || mine <= yours.high);
  return inOurs && inYours;
}
