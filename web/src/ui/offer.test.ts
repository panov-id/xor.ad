import { test } from "node:test";
import assert from "node:assert/strict";
import { offerLabel } from "./offer.ts";

test("offerLabel: one minus whatever the author typed", () => {
  assert.equal(offerLabel("20 %"), "−20 %");
  assert.equal(offerLabel("-20 %"), "−20 %");
  assert.equal(offerLabel("−20%"), "−20%");
  assert.equal(offerLabel(" – 15 % "), "−15 %");
  assert.equal(offerLabel("--5"), "−5");
});
