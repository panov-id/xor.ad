// geo/place.ts: transliteration, a point pasted from a map, the city search with a transcription off by a letter
// (scripts/run-web-unit-tests.sh, node:test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latin, nameOf, parsePoint, searchCities, useCities } from "./place.ts";

useCities(JSON.parse(readFileSync(new URL("./cities.json", import.meta.url), "utf8")).cities);

test("latin: Cyrillic, Greek, Georgian, Armenian to Latin", () => {
  assert.equal(latin("\u041b\u0438\u043c\u0430\u0441\u0441\u043e\u043b"), "limassol");
  assert.equal(latin("Λεμεσός"), "lemesos");
  assert.equal(latin("თბილისი"), "tbilisi");
  assert.equal(latin("Երևան"), "erevan");
});

test("parsePoint: what Google Maps hands over, and what it is not", () => {
  assert.deepEqual(parsePoint("34.6823, 33.0464"), { lat: 34.6823, lon: 33.0464 });
  assert.deepEqual(parsePoint("34,6823; 33,0464"), { lat: 34.6823, lon: 33.0464 });
  assert.deepEqual(parsePoint("-33.86 151.21"), { lat: -33.86, lon: 151.21 });
  assert.equal(parsePoint("Limassol"), null);
  assert.equal(parsePoint("95, 10"), null);
});

test("searchCities: «\u041b\u0438\u043c\u0430\u0441\u0441\u043e\u043b», «Limas», «\u041b\u0435\u043c\u0435\u0441\u043e\u0441» find Limassol; «\u041c\u043e\u0441\u043a\u0432\u0430» finds Moscow a letter off; one letter finds nothing", async () => {
  assert.equal((await searchCities("\u041b\u0438\u043c\u0430\u0441\u0441\u043e\u043b"))[0]?.name, "Limassol");
  assert.equal((await searchCities("Limas"))[0]?.name, "Limassol");
  assert.equal((await searchCities("\u041b\u0435\u043c\u0435\u0441\u043e\u0441"))[0]?.name, "Limassol");
  assert.ok((await searchCities("\u041c\u043e\u0441\u043a\u0432\u0430")).some((p) => p.name === "Moscow" && p.cc === "RU"));
  assert.deepEqual(await searchCities("\u041b"), []);
});

test("nameOf: a point on the Molos promenade is Limassol", async () => {
  assert.deepEqual(await nameOf(34.6719, 33.0436), { name: "Limassol", cc: "CY" });
});
