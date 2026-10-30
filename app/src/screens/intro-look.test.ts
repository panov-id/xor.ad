// wizard-5 by its sheet (390 to 1920): the place is the intro's fifth step under the same bar, not the plain place screen.
// Read from the source: a screen that drops the step or its parts fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const intro = readFileSync(new URL("./Intro.tsx", import.meta.url), "utf8");
const place = readFileSync(new URL("./me/Place.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../shell/App.tsx", import.meta.url), "utf8");

test("wizard-5: the fourth card's «next» opens the place inside the intro", () => {
  assert.match(intro, /if \(n === INTRO_CARDS\.length\) return <Place wizard=\{bar\}/, "Intro.tsx: the fifth step is not the place under the intro's bar");
  assert.doesNotMatch(intro, /last \? onDone\(\) : setN/, "Intro.tsx: the last card still leaves the intro for the plain place screen");
});

test("wizard-5: the place step has the search, the cities in a row and the point row", () => {
  const wiz = place.split("if (wizard) {")[1]?.split('if (view === "map")')[0] ?? "";
  for (const id of ["intro-place", "place-search", "place-found", "place-city", "place-coords"]) {
    assert.ok(wiz.includes(`"${id}"`), `Place.tsx: the wizard step has no ${id}`);
  }
  assert.match(wiz, /\{wizard\}/, "Place.tsx: the wizard step does not show the intro's bar");
});

test("wizard-5: two cities stand before a letter is typed, the nearest to the point", () => {
  assert.match(place, /wizard && !q\.trim\(\) \? allCities\(\)\.then\(\(all\) => nearest\(all, from, SHOWN\)\)/, "Place.tsx: the wizard step shows no cities before the search");
});

test("wizard-5: «here» in the intro leads to the feed", () => {
  assert.match(app, /<Intro [^\n]*onPlaced=\{toFeed\}/, "App.tsx: the intro's place does not lead to the feed");
});
