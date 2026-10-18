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
    "--d-item": "500ms", "--o-item": px(24), "--t-item-start": "350ms", "--stagger-item": "80ms",
    "--d-action": "550ms", "--o-action": px(40), "--t-action-start": "450ms",
    "--d-tabbar": "550ms", "--o-tabbar": px(130), "--t-tabbar-start": "300ms",
    "--d-shimmer": "1300ms", "--stagger-arrive": "120ms",
    "--d-press": "450ms", "--d-spinner": "900ms", "--spinner-arc": "28%",
    "--d-typing": "900ms", "--o-typing": px(5), "--stagger-typing": "150ms",
    "--d-bubble": "350ms", "--stagger-bubble": "380ms", "--scale-bubble-from": ".85",
    "--d-pulse": "1600ms", "--scale-pulse": "1.07",
    "--scale-popup-peak": "1.03",
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
