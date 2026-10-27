// Tests of proto-pairs.mjs: the set is read from the prototype's own index.json (so a screen added there, and not
// shot by the app, is counted missing), and the count names every id without an app shot.
//
//   node --test scripts/design/proto-pairs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pairCount, protoIds, summaryText } from "./proto-pairs.mjs";

const index = JSON.parse(readFileSync(new URL("../../docs/newdesign/proto/index.json", import.meta.url), "utf8"));

test("the set is the prototype's 148 screens, each with its own markup", () => {
  const ids = protoIds(index);
  assert.equal(ids.length, 148);
  assert.equal(new Set(ids).size, ids.length, "an id twice in index.json");
  for (const id of ids) readFileSync(new URL(`../../docs/newdesign/proto/${id}.html`, import.meta.url));
});

test("every id without an app shot is missing, and the summary says so", () => {
  const ids = protoIds(index);
  const shot = new Set(ids.slice(0, 145));
  const c = pairCount(ids, (id) => shot.has(id));
  assert.equal(c.paired, 145);
  assert.deepEqual(c.missing, ids.slice(145));
  assert.match(summaryText(c), /^pairs 145 of 148\nmissing: /);
});

test("all shot: nothing missing", () => {
  const ids = protoIds(index);
  const c = pairCount(ids, () => true);
  assert.equal(summaryText(c), "pairs 148 of 148\n");
});
