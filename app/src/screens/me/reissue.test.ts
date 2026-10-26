// The pure parts of the new paper code (reissue-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { asPaperText, doneReady, groupsAgree, nextReady, notACode, PLACES } from "./reissue-logic.ts";

const CODE = "K7QM2XWDPE4R9FTE";
const GROUPS = ["K7QM", "2XWD", "PE4R", "9FTE"];

test("nextReady: sixteen characters and nothing being sent", () => {
  assert.equal(nextReady(CODE, false), true);
  assert.equal(nextReady(CODE.slice(1), false), false);
  assert.equal(nextReady(CODE, true), false);
  assert.equal(nextReady("", false), false);
});
test("notACode: fewer than sixteen is the web's restore.bad, sixteen is nothing", () => {
  assert.equal(notACode(CODE.slice(0, 15)), "restore.bad");
  assert.equal(notACode(CODE), null);
});
test("doneReady: both groups whole, nothing being sent", () => {
  assert.equal(doneReady(["2XWD", "9FTE"], false), true);
  assert.equal(doneReady(["2XW", "9FTE"], false), false);
  assert.equal(doneReady(["2XWD", ""], false), false);
  assert.equal(doneReady(["2XWD", "9FTE"], true), false);
  assert.equal(doneReady([], false), false);
});
test("groupsAgree: the second and the fourth group of the new code, read as the paper is read", () => {
  assert.equal(groupsAgree(GROUPS, ["2XWD", "9FTE"]), true);
  assert.equal(groupsAgree(GROUPS, ["2xwd", "9fte"]), true);   // any case
  assert.equal(groupsAgree(GROUPS, ["2XWD", "9FTF"]), false);
  assert.equal(groupsAgree(GROUPS, ["K7QM", "9FTE"]), false);  // the first group is not the second
  assert.equal(groupsAgree(GROUPS, ["", ""]), false);
});
test("asPaperText: four groups of four; a short code keeps what it has", () => {
  assert.equal(asPaperText(CODE), "K7QM 2XWD PE4R 9FTE");
  assert.equal(asPaperText("K7QM2"), "K7QM 2");
  assert.equal(asPaperText(""), "");
});
test("PLACES: the second and the fourth", () => {
  assert.deepEqual([...PLACES], [2, 4]);
});
