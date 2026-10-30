// The restore screen by docs/newdesign4 11 (SCREENS_spec §11): four fields 2×2, each a group of the paper code with its
// number; a paste lays the code out; «Continue» quiet until sixteen; the code is checked before the PIN, the PIN on the
// layout of 03/04 with its own words, and keys raised for a PIN never typed are zeroed. Read from the sources.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { spread } from "./me/restore-logic.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const gate = read("./Gate.tsx");
const restore = gate.split("export function Restore(")[1] ?? "";

test("restore 11: four fields with the group's number, Continue quiet until sixteen, the two other ways", () => {
  assert.match(restore, /data-testid="restore-code"/, "Gate.tsx Restore lost the code fields");
  assert.match(restore, /groups\.map\(\(g, i\) =>[\s\S]{0,200}data-group=\{i \+ 1\}/, "the fields carry no group number");
  assert.match(restore, /data-quiet=\{code\.length === CODE_LENGTH && !busy \? undefined : ""\}/, "Continue is not quiet until sixteen");
  const css = read("../../tokens/nd4.css");
  assert.match(css, /\.nd-restore-code \{ grid-template-columns: repeat\(2, 1fr\)/, "the four groups are not 2×2");
  assert.match(css, /\.nd-restore-code \.nd-group::before \{ content: attr\(data-group\)/, "the group's number is not drawn");
  assert.match(restore, /onClick=\{onNew\}[\s\S]{0,200}onClick=\{onArrive\}/, "«No paper code?» lacks its two ways");
  assert.match(read("../shell/App.tsx"), /<Restore [^\n]*onNew=\{[^\n]*onArrive=\{/, "App does not hand the restore its two ways");
});

test("restore 11: the code before the PIN, the PIN with its own words, «back» zeroes the raised keys", () => {
  assert.match(restore, /raiseCode\(code\)[\s\S]{0,400}setStage\("pin"\)/, "the PIN is not asked after the code");
  assert.match(restore, /make=\{\{ title: say\("app\.restore\.pin_title"\)/, "the PIN step has the register's words");
  assert.match(restore, /const back = \(\) => \{[\s\S]{0,120}raised\.current\?\.drop\(\)/, "«back» leaves the raised keys");
  assert.match(restore, /useEffect\(\(\) => \(\) => raised\.current\?\.drop\(\), \[\]\)/, "leaving the screen keeps the raised keys");
  assert.match(gate, /if \(!outcome\.ok\) \{ drop\(\); return \{ outcome \}; \}/, "a refused code keeps the pkcs8 copies");
});

test("restore 11: what is typed fills its field and runs on, a paste lays the whole code out", () => {
  assert.deepEqual(spread(["", "", "", ""], 0, "abcd-efgh ijkl mnop"), ["ABCD", "EFGH", "1JK1", "MN0P"]);
  assert.deepEqual(spread(["ABCD", "", "", ""], 1, "ef"), ["ABCD", "EF", "", ""]);
  assert.deepEqual(spread(["ABCD", "EFGH", "", ""], 1, "EFG"), ["ABCD", "EFG", "", ""]);
  assert.deepEqual(spread(["", "", "", ""], 3, "QRSTUVWX"), ["", "", "", "QRST"]);
});
