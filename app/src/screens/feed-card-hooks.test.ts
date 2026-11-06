// The card's hooks stand above its early return: a hook below it changes the
// hook order when an offer's link is pressed, and React breaks the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("CardScreen calls no hook after its early return for the offer's exit", () => {
  const source = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  const start = source.indexOf("export function CardScreen");
  const early = source.indexOf("if (exit) {", start);
  assert.ok(start >= 0 && early > start, "CardScreen or its early return moved: this check reads nothing");
  const next = source.indexOf("\nexport function", early);
  const end = source.indexOf("\nfunction ", early);
  const body = source.slice(early, Math.min(...[next, end].filter((i) => i > 0)));
  assert.equal(/\buse[A-Z]\w*\(/.test(body), false, "a hook stands below the early return of CardScreen");
});
