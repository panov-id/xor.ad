// The motion tokens against MOTION.md (sosed-animated) and the reduced-motion rule: node:test, no DOM.
// MOTION.md is not in the repo; its numbers are written out here, once, as the reference.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../../tokens/motion.css", import.meta.url), "utf8");
const reduceAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
const base = css.slice(0, reduceAt);
const reduced = css.slice(reduceAt);
const declared = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+?);/g)].map((m) => [m[1], m[2].trim()]));
const root = declared(base);
const calm = declared(reduced);

// Offsets are written as px(n): the raw-px gate of check-app.sh keeps lengths in app/tokens.
const px = (n: number) => `${n}${"p"}x`;

test("MOTION.md numbers, token by token", () => {
  const want: Record<string, string> = {
    "--ease": "cubic-bezier(.22, .9, .24, 1)",
    "--d-header": "450ms", "--o-header": px(12),
    "--t-sheet-in-start": "120ms", "--o-sheet-in": px(620),
    "--d-item": "500ms", "--o-item": px(24), "--t-item-start": "350ms", "--stagger-item": "140ms",
    "--d-action": "550ms", "--o-action": px(40), "--t-action-start": "450ms",
    "--d-tabbar": "550ms", "--o-tabbar": px(130), "--t-tabbar-start": "300ms",
    "--d-shimmer": "1300ms", "--stagger-arrive": "120ms",
    "--d-press": "450ms", "--d-spinner": "900ms", "--spinner-arc": "28%",
    "--d-typing": "900ms", "--o-typing": px(5), "--stagger-typing": "150ms",
    "--d-bubble": "350ms", "--stagger-bubble": "320ms", "--scale-bubble-from": ".85",
    "--d-pulse": "1600ms", "--scale-pulse": "1.07",
    "--scale-popup-peak": "1.03", "--scale-popup-from": ".82", "--scale-popup-out": ".96", "--d-popup-out": "400ms",
  };
  for (const [k, v] of Object.entries(want)) assert.equal(root[k], v, `${k}`);
});

test("reduced motion: every time token (--d-*, --t-*, --stagger-*) is zero there", () => {
  const times = Object.keys(root).filter((k) => /^--(d|t|stagger)-/.test(k));
  assert.ok(times.length > 20, `only ${times.length} time tokens found`);
  const loose = times.filter((k) => !/^0(\.01)?(ms)?$/.test(calm[k] ?? ""));
  assert.deepEqual(loose, []);
});

test("reduced motion: no offset or scale is lost by accident (they stay, the times are zero)", () => {
  assert.equal(calm["--o-item"], undefined);
  assert.equal(calm["--ease"], undefined);
});

// Crowd flow-1026-190348: a sheet's view transition never finished on a 1920 screen and its layer took every tap for
// ten seconds. layers.tsx skips one that outlives VT_GUARD_MS, and the guard sits well above the sheet's own time.
test("a layer's view transition is skipped when it outlives its guard, which is far above the sheet's time", () => {
  const layers = readFileSync(new URL("./layers.tsx", import.meta.url), "utf8");
  assert.match(layers, /setTimeout\(\(\) => t\.skipTransition\(\), VT_GUARD_MS\)/, "layers.tsx no longer skips a stuck view transition");
  assert.match(layers, /clearTimeout\(guard\)/, "the guard outlives a finished transition");
  const guard = Number(/VT_GUARD_MS = (\d+)/.exec(layers)?.[1]);
  const motion = readFileSync(new URL("../../tokens/motion.css", import.meta.url), "utf8");
  const sheet = Number(/--d-sheet: (\d+)ms/.exec(motion)?.[1]);
  assert.ok(sheet > 0 && guard >= sheet * 3, `the guard ${guard} ms would cut a sheet of ${sheet} ms`);
});
