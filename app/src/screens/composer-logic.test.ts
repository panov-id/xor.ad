// composer-logic.ts: the live phrases left, the letters left, when a phrase may go.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canSay, lettersLeft, LIVE_PHRASES, liveLeft } from "./composer-logic.ts";

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
