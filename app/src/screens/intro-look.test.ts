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

test("wizard-1…4: the archive's screens 17–20 at three widths, skip and next wired, every text through p.t", () => {
  for (let k = 1; k <= 4; k++) {
    for (const w of ["", "-tablet", "-laptop"]) {
      const gen = readFileSync(new URL(`../nd4/screens/wizard-${k}${w}.gen.tsx`, import.meta.url), "utf8");
      assert.match(gen, new RegExp(`screen ${16 + k} \\(family wizard-${k}`), `wizard-${k}${w}: not generated from screen ${16 + k}`);
      assert.match(gen, /onClick=\{p\.onSkip\} data-testid="intro-close"/, `wizard-${k}${w}: «Skip» does not leave the intro`);
      assert.match(gen, /onClick=\{p\.onNext\} data-testid="intro-next"/, `wizard-${k}${w}: «Next» does not go on`);
      if (k > 1) assert.match(gen, /onClick=\{p\.onBack\} data-testid="intro-back"/, `wizard-${k}${w}: «back» goes nowhere`);
      const bare = [...gen.matchAll(/>([^<{}>]*[A-Za-z][^<{}>]*)</g)].map((m) => m[1].trim()).filter(Boolean);
      assert.deepEqual(bare, [], `wizard-${k}${w}: archive text left untranslatable`);
    }
    assert.match(intro, new RegExp(`\\[Wizard${k}Screen, Wizard${k}ScreenTablet, Wizard${k}ScreenLaptop\\]`), `Intro.tsx: card ${k} is not the archive's screen`);
  }
  assert.match(intro, /onBack=\{\(\) => setN\(Math\.max\(0, n - 1\)\)\}/, "Intro.tsx: «back» does not step back");
  assert.match(intro, /<Screen t=\{words\(/, "Intro.tsx: the cards get no words");
});
