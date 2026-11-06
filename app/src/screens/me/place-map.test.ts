// The place map's pure part (place-map.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { City } from "../../../../depth/core/place.ts";
import { citiesOn, dragged, LABELS, mergePlaces, pinched, pxPerM, tilePath, tilesFor, toView } from "./place-map.ts";

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

test("citiesOn: only those on the view, the biggest first, all as points, six named", () => {
  const near = (n: number): City => [`c${n}`, "CY", 34.68 + n * 0.001, 33.04, 1000 - n];
  const all: City[] = [["Far", "IT", 41.9, 12.5, 9e6], ...Array.from({ length: 9 }, (_, i) => near(i))];
  const got = citiesOn(all, LIMASSOL, 3000, 390, 600);
  assert.equal(got.length, 9);
  assert.deepEqual(got.filter((c) => c.label).map((c) => c.name), ["c0", "c1", "c2", "c3", "c4", "c5"]);
  assert.equal(LABELS, 6);
});

test("a village of population 0 from the real file is a point on the map, none lost in the merge", () => {
  const doc = JSON.parse(readFileSync(new URL("./villages-cy.json", import.meta.url), "utf8")) as { cities: City[] };
  const zero = doc.cities.find((p) => p[4] === 0)!;
  const all = mergePlaces([["Big", "CY", zero[2], zero[3], 90000]], doc.cities);
  assert.equal(all.length, doc.cities.length + 1);
  assert.equal(all[0][0], "Big");
  const got = citiesOn(all, { lat: zero[2], lon: zero[3] }, 10000, 390, 600);
  assert.ok(got.some((c) => c.name === zero[0]), zero[0]);
});

test("mergePlaces: the same place in both lists stays once", () => {
  const p: City = ["A", "CY", 1, 2, 5];
  assert.equal(mergePlaces([p], [p]).length, 1);
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

// docs/newdesign4 screen 23 place-map, phone and tablet. owner 31.10.2026: screens 23–29 are the archive's markup as is (scripts/design/nd4-extract.py), not hand classes
test("place-map: the map view draws the generated screen and adds no markup of its own", async () => {
  const src = readFileSync(new URL("./Place.tsx", import.meta.url), "utf8");
  const gen = readFileSync(new URL("../../nd4/screens/place-map.gen.tsx", import.meta.url), "utf8");
  const kit = readFileSync(new URL("../../../tokens/nd4-kit.css", import.meta.url), "utf8");
  const view = src.slice(src.indexOf('data-view="map"'), src.indexOf("</main>", src.indexOf('data-view="map"')));
  assert.match(view, /<Screen\b/, "the map view renders the screen picked for its width");
  assert.match(src, /const Screen = wide === "laptop" \? PlaceMapScreenLaptop : wide === "tablet" \? PlaceMapScreenTablet : PlaceMapScreen;/, "the map view picks among the three generated screens");
  const own = [...view.matchAll(/className=|style=\{/g)].length;
  assert.equal(own, 0, `the map view adds ${own} class or style attributes of its own`);
  assert.match(gen.split("\n")[0], /^\/\/ generated from docs\/newdesign4\/.*kypros-phone\.html/, "the screen is generated from the archive");
  const tab = readFileSync(new URL("../../nd4/screens/place-map-tablet.gen.tsx", import.meta.url), "utf8");
  assert.match(tab.split("\n")[0], /^\/\/ generated from docs\/newdesign4\/.*kypros-tablet\.html/, "the tablet's screen is generated from the archive");
  for (const [name, g] of [["phone", gen], ["tablet", tab]])
    for (const id of ["place-radius", "place-near", "place-here", "place-wider", "back"]) assert.ok(g.includes(`"${id}"`), `the ${name} screen keeps data-testid ${id}`);
  const lap = readFileSync(new URL("../../nd4/screens/place-map-laptop.gen.tsx", import.meta.url), "utf8");
  assert.match(lap.split("\n")[0], /^\/\/ generated from docs\/newdesign4\/.*kypros-laptop\.html/, "the laptop's screen is generated from the archive");
  for (const id of ["place-radius", "place-near", "place-here", "place-lead"]) assert.ok(lap.includes(`"${id}"`), `the laptop screen keeps data-testid ${id}`);
  assert.match(view, /lead=\{say\("app\.place\.lead"\)\}/, "the laptop panel's lead is the app's text");
  assert.match(view, /\{wide === "tablet" && <RailTablet active="feed" \/>\}/, "on the tablet the map view keeps the archive's rail at its left");
  assert.match(src, /const wide = pane \? "phone" : fits === "laptop" && !desk \? "tablet" : fits;/, "the laptop drawing only from --bp-desktop, where its frame and nav are; Me's side pane keeps the phone drawing");
  assert.match(src, /data-sea=\{land\.length \? "" : undefined\}/, "with land drawn the map's ground is the sea (archive 024, 026)");
  assert.match(readFileSync(new URL("../../../tokens/nd4-kit.css", import.meta.url), "utf8"), /\.nd-place-map \.k-map\[data-sea\][^{]*\{ background:/,
    "the kit has the sea's ground for the map with data-sea");
  assert.match(view, /\{wide === "laptop" && <Rail active="feed" \/>\}/, "on the laptop the map view keeps the nav at its left (archive 023)");
  const main = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");
  assert.match(main, /import "\.\.\/tokens\/nd4-kit\.css";/, "main.tsx loads the archive's sheet nd4-kit.css");
  assert.match(kit, /\.nd-place-map \.k-map-ring \{[^}]*stroke-dasharray:none/, "the ring on screen 23 is solid, as the archive draws it");
});

// docs/newdesign4 screens 26–28: the line under the radius. A square island 0..1 of the tile 34_33 (milli-degrees).
test("nearKind and onLand: sea only when known, «around you» when no city is near, near otherwise", async () => {
  const { metres, nearKind, onLand, CITY_NEAR_M } = await import("./place-map.ts");
  const island = [{ key: "34_33", t: { r: [[100, 100, 900, 100, 900, 900, 100, 900]] } }];
  assert.equal(onLand({ lat: 34.5, lon: 33.5 }, island), true);
  assert.equal(onLand({ lat: 34.05, lon: 33.5 }, island), false, "south of the island is sea");
  const lake = [{ key: "34_33", t: { r: [...island[0].t.r, [400, 400, 600, 400, 600, 600, 400, 600]] } }];
  assert.equal(onLand({ lat: 34.5, lon: 33.5 }, lake), false, "a lake is a hole in the land");
  assert.equal(nearKind(true, 2000, 3000), "sea");
  assert.equal(nearKind(null, 2000, 3000), "near", "land not loaded (28) is not the sea");
  assert.equal(nearKind(false, 2000, 3000), "near");
  assert.equal(nearKind(false, CITY_NEAR_M + 1, 3000), "none");
  assert.equal(nearKind(true, 20_000, 3000), "none", "no city near wins over the sea");
  assert.equal(nearKind(false, 20_000, 25_000), "near", "a wide circle reaches the city");
  assert.ok(Math.abs(metres({ lat: 34, lon: 33 }, { lat: 34.01, lon: 33 }) - 1113.2) < 1);
});

test("widenedFor: the feed's grown circle reaches the map only for the radius the feed asked with", async () => {
  const { noteWidened, widenedFor } = await import("../feed-logic.ts");
  noteWidened(1000, 25000);
  assert.equal(widenedFor(1000), 25000);
  assert.equal(widenedFor(3000), null);
  noteWidened(1000, null);
  assert.equal(widenedFor(1000), null);
});

test("place-map: the widened line is shown only at the saved place, not for a point moved off it (panel 31.10)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./Place.tsx", import.meta.url), "utf8");
  assert.match(src, /const atSaved = now\.chosen && Math\.abs\(at\.lat - now\.lat\) < 1e-6 && Math\.abs\(at\.lon - now\.lon\) < 1e-6;/, "the point is compared with the saved place");
  assert.match(src, /const wider = atSaved \? widenedFor\(radius\) : null;/, "off the saved place there is no widened line");
});

test("screen 22: the main view is the archive's place screen at each width, the list made of its «Recent» row", () => {
  const src = readFileSync(new URL("./Place.tsx", import.meta.url), "utf8");
  assert.match(src, /const Main = wide === "laptop" \? PlaceScreenLaptop : wide === "tablet" \? PlaceScreenTablet : PlaceScreen;/);
  assert.match(src, /const PRow = wide === "laptop" \? PlaceRowLaptop : wide === "tablet" \? PlaceRowTablet : PlaceRow;/);
  const main = src.slice(src.indexOf("const Main ="));
  assert.doesNotMatch(main, /<(button|ul|li|section|Field|Row)\b/, "no hand markup in the main view");
  assert.match(main, /\{wide === "tablet" && <RailTablet active="feed" \/>\}/);
  // an error and the QR's question show in the archive's caption slot, not only to a screen reader
  assert.match(main, /note=\{error \?\? \(start \? nowLine : say\("app\.place\.note"\)\)\}/);
});
