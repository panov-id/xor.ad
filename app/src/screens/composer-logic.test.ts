// composer-logic.ts: the live phrases left, the letters left, when a phrase may go.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canSay, lettersLeft, LIVE_PHRASES, liveLeft, ownPhrases } from "./composer-logic.ts";

test("liveLeft: four less one's own live phrases, never below none", () => {
  assert.equal(LIVE_PHRASES, 4);
  assert.deepEqual(liveLeft(0), { left: 4, of: 4 });
  assert.deepEqual(liveLeft(1), { left: 3, of: 4 });
  assert.deepEqual(liveLeft(4), { left: 0, of: 4 });
  assert.deepEqual(liveLeft(6), { left: 0, of: 4 });
});

test("lettersLeft: code points, as a person counts (an emoji is one letter)", () => {
  assert.equal(lettersLeft("Backgammon in the yard tonight?", 128), 128 - 31);
  assert.equal(lettersLeft("кофе 🙂", 10), 4);
  assert.equal(lettersLeft("x".repeat(200), 128), 0);
});

test("canSay: a letter, within the limit, and a live phrase left", () => {
  assert.equal(canSay("кофе?", 128, 3), true);
  assert.equal(canSay("   ", 128, 3), false);
  assert.equal(canSay("x".repeat(129), 128, 3), false);
  assert.equal(canSay("кофе?", 128, 0), false);
});

// newdesign3 composer.html (plan A item 3): the settings panel starts with the «where» row — the place and the circle,
// «where · tap to change» — and the row opens the place screen through onPlace (App.tsx wires the feed's toPlace).
test("the composer has the «where» row: place · circle, tap opens the place", () => {
  const src = readFileSync(new URL("./Composer.tsx", import.meta.url), "utf8");
  assert.match(src, /className="k-row k-where" onClick=\{actions\.onPlace\}/, "Composer.tsx: no «where» row calling onPlace");
  assert.match(src, /\$\{radiusText\(state\.zone\)\}/, "the «where» row does not show the circle");
  assert.match(src, /say\("app\.compose\.where_change"\)/, "the «where» row lost «tap to change»");
  const app = readFileSync(new URL("../shell/App.tsx", import.meta.url), "utf8");
  assert.match(app, /<Composer [^\n]*onPlace=\{toPlace\}/, "App.tsx does not pass the place screen to the composer");
});

// Panel A3 (29.10): the place shows once — in the «where» row; the label over the text keeps the phrase's life only.
// The three new head/row strings exist in both dictionaries.
test("the composer's place is in the «where» row only; the new strings are in RU and EN", () => {
  const src = readFileSync(new URL("./Composer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /app\.compose\.where"/, "Composer.tsx shows the place twice: the label still says «To the yard in {place}»");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const key of ["app.feed.head", "app.feed.place_radius", "app.compose.where_change"])
    assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});

test("ownPhrases: a live lost takes none of the four", () => {
  assert.equal(ownPhrases([{ kind: "phrase" }, { kind: "lost" }, {}]), 2);
  assert.equal(ownPhrases(undefined), 0);
});
