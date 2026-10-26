// The pure parts of the paper-code gate (restore-logic.ts) and of "hidden" and "blocked" (lists-logic.ts).
// scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lifted, sinceDay, titled, without } from "./lists-logic.ts";
import { codeChars, newPinDigits, refusalLine, restoreReady, zeroAfter } from "./restore-logic.ts";

test("codeChars: any case, dashes and spaces dropped, I L O read as digits, sixteen at most", () => {
  assert.equal(codeChars("k7qm-2xwd pl4r 9fte"), "K7QM2XWDP14R9FTE"); // the L of a hand is the digit 1
  assert.equal(codeChars("OIL"), "011");
  assert.equal(codeChars("K7QM2XWDPE4R9FTE99999"), "K7QM2XWDPE4R9FTE");
  assert.equal(codeChars("  --  "), "");
});
test("newPinDigits: digits only, six at most", () => {
  assert.equal(newPinDigits("48a39-15 77"), "483915");
  assert.equal(newPinDigits(""), "");
});
test("restoreReady: sixteen characters, six digits, nothing being sent", () => {
  const code = "K7QM2XWDPE4R9FTE";
  assert.equal(restoreReady(code, "483915", false), true);
  assert.equal(restoreReady(code.slice(1), "483915", false), false);
  assert.equal(restoreReady(code, "48391", false), false);
  assert.equal(restoreReady(code, "483915", true), false);
});
test("refusalLine: no match, the wait with its seconds, any other refusal with its status", () => {
  assert.deepEqual(refusalLine({ reason: "no_match", status: 404 }), { key: "restore.noMatch", values: {} });
  assert.deepEqual(refusalLine({ reason: "rate_limited", retryAfter: 12 }), { key: "restore.wait", values: { n: "12" } });
  assert.deepEqual(refusalLine({ reason: "rate_limited" }), { key: "restore.wait", values: { n: "?" } });
  assert.deepEqual(refusalLine({ reason: "refused", status: 500 }), { key: "restore.refused", values: { status: "500" } });
  assert.deepEqual(refusalLine({ reason: "stepped_away" }), { key: "restore.refused", values: { status: "stepped_away" } });
});
test("lifted: 200 and 204 are done, a refusal is not", () => {
  assert.equal(lifted(204), true);
  assert.equal(lifted(200), true);
  assert.equal(lifted(403), false);
  assert.equal(lifted(500), false);
});
test("without: the handle goes, the others stay in order", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(without(rows, "b"), [{ id: "a" }, { id: "c" }]);
  assert.deepEqual(without(rows, "zz"), rows);
  assert.equal(rows.length, 3);
});
test("titled: the word and the count; the bare word before the list came", () => {
  assert.equal(titled("Hidden", [1, 2]), "Hidden · 2");
  assert.equal(titled("Blocked", []), "Blocked · 0");
  assert.equal(titled("Hidden", null), "Hidden");
});
test("sinceDay: the sheet's day and month; a moment that is not a number is ?", () => {
  const noon = new Date(2026, 9, 9, 12).getTime() / 1000; // local noon: the runner sits on UTC+14, the day must not move
  assert.equal(sinceDay("en", noon), "9 Oct");
  assert.equal(sinceDay("en", undefined), "?");
  assert.equal(sinceDay("en", Number.NaN), "?");
});

test("zeroAfter: the held keys are zeroed when the work throws (a refused first PIN) and when it returns", async () => {
  const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([4, 5]);
  await assert.rejects(zeroAfter(() => [a, b, null], async () => { throw new Error("the first PIN was refused: 403"); }), /refused/);
  assert.deepEqual([...a, ...b], [0, 0, 0, 0, 0], "a refusal left key bytes in memory");
  const c = new Uint8Array([9]);
  assert.equal(await zeroAfter(() => [c], async () => "ok"), "ok");
  assert.deepEqual([...c], [0], "a success left key bytes in memory");
});
