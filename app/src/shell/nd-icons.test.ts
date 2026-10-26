// The new design's icons (NEWDESIGN_PLAN §4, §7 step 2): all 106 of the archive, only plain shapes, and each chip's
// accent one of the theme's six (--acc-1…6). Four icons have no chip in the archive and say so with a null accent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ND_ICONS } from "./nd-icons.gen.ts";

test("106 of 106 icons, each drawn by plain shapes only", () => {
  const names = Object.keys(ND_ICONS);
  assert.equal(names.length, 106, `the archive has 106 icons, the app ${names.length}`);
  for (const [name, icon] of Object.entries(ND_ICONS)) {
    assert.ok(icon.els.length > 0, `${name} draws nothing`);
    for (const [tag, attrs] of icon.els) {
      assert.ok(["path", "circle", "rect"].includes(tag), `${name} has a <${tag}>`);
      for (const [k, v] of Object.entries(attrs)) {
        assert.ok(!/^on|style|href/i.test(k), `${name} carries ${k}`);
        assert.ok(!/url\(|javascript:|<|>/i.test(v), `${name}.${k} carries «${v}»`);
      }
    }
  }
});

test("each chip's accent is one of the six; the four without a chip are named", () => {
  const none = Object.entries(ND_ICONS).filter(([, i]) => i.accent === null).map(([n]) => n).sort();
  assert.deepEqual(none, ["me-a", "me-b", "say-a", "say-b"], "the icons with no chip changed");
  for (const [name, i] of Object.entries(ND_ICONS)) if (i.accent !== null) assert.ok(i.accent >= 1 && i.accent <= 6, `${name}: --acc-${i.accent}`);
  const css = readFileSync(new URL("../../tokens/themes.css", import.meta.url), "utf8");
  for (const n of [1, 2, 3, 4, 5, 6]) assert.equal((css.match(new RegExp(`--acc-${n}:`, "g")) ?? []).length, 4, `--acc-${n} is not in all four themes`);
});

test("the chip is the README's: big × 1.45, rounded big × 0.42, white icon on a 28 % white fill", () => {
  const css = readFileSync(new URL("../../tokens/nd-icons.css", import.meta.url), "utf8");
  assert.match(css, /width: calc\(var\(--chip-big\) \* 1\.45\)/);
  assert.match(css, /border-radius: calc\(var\(--chip-big\) \* 0\.42\)/);
  assert.match(css, /--ifill: rgba\(255, 255, 255, \.28\)/);
});
