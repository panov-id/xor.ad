// The place map's pure part (place-map.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { City } from "../../../../depth/core/place.ts";
import { citiesOn, dragged, LABELS, pinched, pxPerM, tilePath, tilesFor, toView } from "./place-map.ts";

const LIMASSOL = { lat: 34.68, lon: 33.04 };

test("pxPerM: radius × 1.6 fills half the short side", () => {
  assert.equal(pxPerM(1000, 390, 400), 195 / 1600);
  assert.equal(pxPerM(1000, 1920, 400), 200 / 1600);
});

test("toView and dragged: the centre sits in the middle, a drag moves it the other way and back", () => {
  const s = pxPerM(1000, 400, 400);
  assert.deepEqual(toView(LIMASSOL, LIMASSOL, s, 400, 400), [200, 200]);
  const east = toView({ lat: 34.68, lon: 33.05 }, LIMASSOL, s, 400, 400);
  assert.ok(east[0] > 200 && east[1] === 200, "east is to the right");
  const c = dragged(LIMASSOL, 100, 0, s);
  assert.ok(c.lon < LIMASSOL.lon, "drag right: the centre goes west");
  const back = dragged(c, -100, 0, s);
  assert.ok(Math.abs(back.lon - LIMASSOL.lon) < 1e-9 && back.lat === LIMASSOL.lat);
  assert.ok(dragged({ lat: 0, lon: 179.999 }, -1000, 0, s).lon < -179, "across the antimeridian");
});

test("tilesFor: no land under 3 km; at 10 km around Limassol the tiles of Cyprus's south coast", () => {
  for (const r of [100, 300, 1000] as const) assert.deepEqual(tilesFor(LIMASSOL, r, 390, 600), []);
  assert.deepEqual(tilesFor(LIMASSOL, 10000, 390, 600), ["34_32", "34_33"]);
  assert.deepEqual(tilesFor({ lat: 0.05, lon: 179.95 }, 10000, 600, 600), ["-1_179", "-1_-180", "0_179", "0_-180"]);
});

test("tilePath: a tile's ring lands where its degrees are; an empty tile draws nothing", () => {
  const s = pxPerM(10000, 400, 400);
  const d = tilePath("34_33", { r: [[40, 680, 50, 680, 50, 690]] }, LIMASSOL, s, 400, 400);
  assert.match(d, /^M200\.0 200\.0L\d+\.\d \d+\.\d+L\d+\.\d \d+\.\d+Z$/);
  assert.equal(tilePath("34_33", { r: [] }, LIMASSOL, s, 400, 400), "");
});

test("citiesOn: only those on the view, the biggest first, six at most", () => {
  const near = (n: number): City => [`c${n}`, "CY", 34.68 + n * 0.001, 33.04, 1000 - n];
  const all: City[] = [["Far", "IT", 41.9, 12.5, 9e6], ...Array.from({ length: 9 }, (_, i) => near(i))];
  const got = citiesOn(all, LIMASSOL, 3000, 390, 600);
  assert.equal(got.length, LABELS);
  assert.deepEqual(got.map((c) => c.name), ["c0", "c1", "c2", "c3", "c4", "c5"]);
});

test("pinched: the radius follows the fingers to the nearest of the five steps", () => {
  assert.equal(pinched(1000, 1), 1000);
  assert.equal(pinched(1000, 3), 300);
  assert.equal(pinched(1000, 1 / 3), 3000);
  assert.equal(pinched(1000, 100), 100);
  assert.equal(pinched(1000, 0.001), 10000);
  assert.equal(pinched(1000, 0), 1000);
  assert.equal(pinched(1000, Number.NaN), 1000);
});
