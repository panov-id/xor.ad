// The splash (docs/newdesign4 screen 01): icons step away from a finger, up to 34 px, never out of the panel; twelve
// icons as SCREENS_spec §1 lists, each resting inside the panel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EDGE, flee, PUSH } from "./splash-logic.ts";
import { FLOATS } from "./splash-art.gen.ts";

const panel = { left: 0, top: 0, right: 362, bottom: 600 };

test("an icon right by the finger steps away from it, up to 34 px; far from it, it stays", () => {
  const near = flee(200, 300, 22, 190, 300, panel);
  assert.ok(near.px > 0 && near.px <= PUSH, `pushed ${near.px}`);
  assert.equal(Math.round(near.py), 0);
  assert.deepEqual(flee(200, 300, 22, 10, 10, panel), { px: 0, py: 0 });
});

test("an icon by the panel's edge never leaves it: 8 px stays between them", () => {
  const { px } = flee(330, 300, 22, 320, 300, panel);
  assert.ok(330 + px + 22 <= panel.right - EDGE + 1e-9, `the icon's edge at ${330 + px + 22}`);
});

test("twelve icons, each resting inside the panel", () => {
  assert.equal(FLOATS.length, 12, `${FLOATS.length} of 12 icons`);
  for (const f of FLOATS) for (const [x, y] of [[f.x, f.y], [f.tx, f.ty]]) assert.ok(x > 5 && x < 95 && y > 5 && y < 95, `icon ${f.d} at ${x}% ${y}%`);
  assert.deepEqual(FLOATS.map((f) => f.d).sort((a, b) => a - b), [...Array(12).keys()], "each drift phase once");
  assert.equal(FLOATS.filter((f) => f.acc).length, 4, "every third icon is in the accent");
});
