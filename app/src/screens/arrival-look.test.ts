// The arrival screens by their sheets (arrival-1/2/3, 390 to 1920): the code on three tiles in a row, the check with
// «cancel» at the foot and the eye in the scene, the new PIN with its pad; the words of docs/newdesign4 11–13
// (kypros-phone.html), the brand's name put in, not written. Read from the source: a screen that drops one fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const arrival = readFileSync(new URL("./Arrival.tsx", import.meta.url), "utf8");

test("arrival-1: the nine characters come on three tiles", () => {
  assert.match(arrival, /const MOVE_CODE_GROUP = 3;/, "Arrival.tsx: the code group is not three");
  assert.match(arrival, /size=\{MOVE_CODE_LENGTH\} group=\{MOVE_CODE_GROUP\}/, "Arrival.tsx: the code cells are not grouped");
});

test("arrival-2: the check has «cancel» at the foot and the eye in the scene", () => {
  const check = arrival.split("// arrival-2:")[1] ?? "";
  assert.match(check, /<MoveSheet foot=\{[^]*data-testid="arrive-cancel"/, "Arrival.tsx: the check lost its cancel foot");
  assert.match(arrival, /state === "approved" \? "pin" : ending \? "move" : "eye"/, "Arrival.tsx: the scene does not show the eye on the check");
});

test("arrival-3: the new PIN is typed on the pad", () => {
  const approved = arrival.slice(arrival.lastIndexOf('if (state === "approved")')).split("// arrival-2:")[0];
  assert.match(approved, /<PinPad onKey=/, "Arrival.tsx: the new PIN has no pad");
  assert.equal(approved.match(/<Cells /g)?.length, 2, "Arrival.tsx: the new PIN has not two Cells (the PIN and its repeat)");
  assert.match(approved, /\{second\s*\? <Cells key="again"[^]*: <Cells key="pin"/, "Arrival.tsx: the PIN and its repeat are not one row in turn");
});

test("arrival-3: no «done» foot, a matching repeat keeps the PIN by itself", () => {
  const approved = arrival.slice(arrival.lastIndexOf('if (state === "approved")')).split("// arrival-2:")[0];
  assert.doesNotMatch(approved, /arrive-keep/, "Arrival.tsx: the new PIN still has a «done» foot");
  assert.match(arrival, /useEffect\(\(\) => \{ if \(state === "approved" && newPinReady\(pin, again\)\) void keep\(\); \}/, "Arrival.tsx: a matching repeat does not keep the PIN");
});

test("arrival 11–13: the mockup's words in English, the brand's name put in", () => {
  const dict = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  const en = dict.slice(dict.indexOf("app.move.in_title", dict.indexOf("app.move.in_title") + 1));
  for (const [k, v] of [["code_title", "Move {name} here"], ["code_sub", "Type the code your other device shows."],
    ["check_title", "Check both screens"], ["waiting", "Waiting for your other device…"]]) {
    assert.ok(en.includes(`"app.move.${k}": "${v}"`), `the English app.move.${k} is not the mockup's «${v}»`);
  }
  assert.doesNotMatch(dict, /"app\.move\.(in|code)_title": "[^"]*sosed/, "the brand's name is written into the words");
  assert.match(arrival, /say\("app\.move\.code_title", \{ name: brand\.name \}\)/, "Arrival.tsx does not put the brand's name in");
});
