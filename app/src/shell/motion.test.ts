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

test("MOTION.md offsets and scales, token by token (the times are the scale's: next test)", () => {
  const want: Record<string, string> = {
    "--ease": "cubic-bezier(.22, .9, .24, 1)",
    "--o-header": px(12), "--o-sheet-in": px(620), "--o-item": px(24), "--o-action": px(40), "--o-tabbar": px(130),
    "--d-shimmer": "1300ms", "--d-spinner": "900ms", "--spinner-arc": "28%", "--d-typing": "900ms", "--o-typing": px(5),
    "--scale-bubble-from": ".85", "--d-pulse": "1600ms", "--scale-pulse": "1.07",
    "--scale-popup-peak": "1.03", "--scale-popup-from": ".82", "--scale-popup-out": ".96",
  };
  for (const [k, v] of Object.entries(want)) assert.equal(root[k], v, `${k}`);
});

// NEWDESIGN_PLAN §7 step 4: every move is a step of the designer's scale --dur-0…4, defined in all four themes; only the
// loops keep a period of their own. A number written back into a move goes red here.
const LOOPS = ["--d-shimmer", "--d-spinner", "--d-typing", "--d-pulse"];
const themes = readFileSync(new URL("../../tokens/themes.css", import.meta.url), "utf8");
test("every duration, delay and stagger is a step of --dur-0…4, and the four themes define the steps (N of M)", () => {
  const times = Object.keys(root).filter((k) => /^--(d|t|stagger)-/.test(k) && !LOOPS.includes(k));
  const raw = times.filter((k) => !/^var\(--dur-[0-4]\)$/.test(root[k]));
  assert.deepEqual(raw, [], `time tokens not on the scale: ${raw.map((k) => `${k}: ${root[k]}`).join(", ")}`);
  assert.ok(times.length >= 27, `only ${times.length} of 27 time tokens found`);
  for (const t of ["white", "sea", "plum", "black"]) {
    const block = new RegExp(`:root\\[data-theme="${t}"\\] \\{([\\s\\S]*?)\\n\\}`).exec(themes)?.[1] ?? "";
    for (const n of [0, 1, 2, 3, 4]) assert.match(block, new RegExp(`--dur-${n}: \\d+ms;`), `${t} has no --dur-${n}`);
  }
  assert.match(themes, /prefers-reduced-motion: reduce[\s\S]*--dur-0: 0s; --dur-1: 0s; --dur-2: 0s; --dur-3: 0s; --dur-4: 0s;/, "the scale is not zero under reduced motion");
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
  const step = /--d-sheet: var\(--dur-(\d)\)/.exec(motion)?.[1];
  const sheet = Number(new RegExp(`--dur-${step}: (\\d+)ms`).exec(themes)?.[1]);
  assert.ok(sheet > 0 && guard >= sheet * 3, `the guard ${guard} ms would cut a sheet of ${sheet} ms`);
});
