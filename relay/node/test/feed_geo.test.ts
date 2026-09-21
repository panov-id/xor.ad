// The arithmetic the feed stands on, tested apart from the database.
//
// Both pieces are small, and small is how they go wrong quietly: a grid whose
// cosine is taken from the wrong latitude still returns plausible numbers, and
// a band that is checked in one direction only still shows somebody a feed.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { band, boundingBox, metresBetween, quantise, visibleToEachOther } from "../src/lib/feed_geo.ts";

Deno.test("two centres in one cell round to the same node", () => {
  // The whole point of the grid (§8.3): with the same radius, everybody inside
  // one cell hands out identical coordinates, so equality stops being a mark.
  const a = quantise({ lat: 41.9021, lon: 12.4964 }, 1000);
  const b = quantise({ lat: 41.9033, lon: 12.4971 }, 1000);
  assertEquals(a, b, "two neighbours in one cell were published apart");

  // And a different radius is a different grid — a phrase published with a
  // coarser area rounds coarser.
  const coarse = quantise({ lat: 41.9021, lon: 12.4964 }, 10000);
  assert(coarse.lat !== a.lat || coarse.lon !== a.lon, "the step did not follow the radius");
});

Deno.test("the longitude step is taken from the rounded latitude, not the exact one", () => {
  // This is the line §8.3 says cancels the whole paragraph if written naively:
  // take the cosine from the exact latitude and the longitude step becomes a
  // function of an unpublished value, so two people in one cell land on
  // different nodes again — which is exactly what the grid exists to prevent.
  const radius = 1000;
  const exactCosine = (point: { lat: number; lon: number }) => {
    const dPhi = radius / 111320;
    const latQ = Math.round(point.lat / dPhi) * dPhi;
    const dLambda = radius / (111320 * Math.cos((point.lat * Math.PI) / 180));
    return { lat: latQ, lon: Math.round(point.lon / dLambda) * dLambda };
  };

  // Two points whose exact latitudes differ enough for the naive version to
  // disagree, while the correct one keeps them together.
  const one = { lat: 59.3300, lon: 18.0650 };
  const two = { lat: 59.3340, lon: 18.0650 };
  assertEquals(
    quantise(one, radius),
    quantise(two, radius),
    "the correct rounding split one cell",
  );
  const naive = [exactCosine(one), exactCosine(two)];
  assert(
    naive[0].lon !== naive[1].lon,
    "this case no longer distinguishes the naive rounding from the correct one",
  );
});

Deno.test("the poles do not produce an infinite step", () => {
  // The cosine vanishes there and a naive division would give Infinity, which
  // spreads into every coordinate downstream as NaN.
  const at = quantise({ lat: 89.999999, lon: 173.2 }, 100);
  assert(Number.isFinite(at.lat) && Number.isFinite(at.lon), `got ${JSON.stringify(at)}`);
});

Deno.test("the band is two worlds that touch at the edge", () => {
  assertEquals(band(13), { low: 13, high: 15 });
  assertEquals(band(20), { low: 18, high: 22 });
  assertEquals(band(21), { low: 19, high: null });
  assertEquals(band(40), { low: 21, high: null });

  // A twenty-year-old and a twenty-one-year-old meet: the edge is soft.
  assert(visibleToEachOther(20, 21), "the soft edge does not meet");
  // And what the band protects is intact: under 19 is cut off from 21+.
  assert(!visibleToEachOther(18, 21), "an eighteen-year-old reached the adult pool");
  assert(!visibleToEachOther(16, 30), "a sixteen-year-old reached an adult");
  // Symmetry, both directions of the same pair.
  assertEquals(visibleToEachOther(19, 21), visibleToEachOther(21, 19));
  assertEquals(visibleToEachOther(16, 30), visibleToEachOther(30, 16));
});

Deno.test("an adult's band has no upper edge, and a teenager's does", () => {
  assert(visibleToEachOther(30, 80), "two adults far apart in age cannot see each other");
  assert(!visibleToEachOther(14, 17), "a fourteen-year-old sees outside their band");
  assert(visibleToEachOther(14, 16), "a fourteen-year-old cannot see inside their band");
});

Deno.test("the bounding box contains the circle it is built for", () => {
  const centre = { lat: 41.9, lon: 12.5 };
  const box = boundingBox(centre, 5000);
  // A point due north at the edge is inside the box.
  const north = { lat: centre.lat + 5000 / 111320, lon: centre.lon };
  assert(north.lat <= box.latMax, "the box does not contain its own circle");
  assert(Math.abs(metresBetween(centre, north) - 5000) < 50, "the distance disagrees with the box");
});
