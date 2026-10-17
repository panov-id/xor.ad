// depth/core/limits.ts: graphemes counted as the node counts them, and the
// away spans the web and the terminal share. scripts/run-web-unit-tests.sh, node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AWAY_MINUTES, graphemeCount, graphemes } from "../../depth/core/limits.ts";

test("an emoji, a family and a flag are one grapheme each", () => {
  assert.equal(graphemeCount("ab"), 2);
  assert.equal(graphemeCount("👍"), 1);
  assert.equal(graphemeCount("👨‍👩‍👧‍👦"), 1);
  assert.equal(graphemeCount("🇩🇪"), 1);
  assert.equal(graphemeCount("е́"), 1);
});

test("a cut never splits an emoji", () => {
  assert.equal(graphemes("а".repeat(30) + "👍", 24), "а".repeat(24));
  assert.equal(graphemes("а".repeat(23) + "👍👍", 24), "а".repeat(23) + "👍");
});

test("the away spans", () => {
  assert.deepEqual(AWAY_MINUTES, { short: 20, hour: 60, long: 240 });
});
