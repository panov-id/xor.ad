// Contrast of every text/background pair the panel actually uses, in both
// themes. Checked by arithmetic rather than by eye: a token that reads fine on
// one theme can fail on the other, and a screenshot will not say so.
//
//   node panel/tests/contrast.mjs
//
// Exits non-zero on a pair below its threshold, so it can gate a build.

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

// Pull a theme's values out of the stylesheet, so this checks what ships rather
// than a copy that can drift from it.
function tokens(selector) {
  const block = css.slice(css.indexOf(selector) + selector.length);
  const body = block.slice(0, block.indexOf("}"));
  const values = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    values[name] = value.trim();
  }
  return values;
}

const channel = (value) => {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const ratio = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

// name, foreground token, background token, minimum. Large or bold text may sit
// at 3:1; body text may not.
const PAIRS = [
  ["body text on the page", "ink", "page", 4.5],
  ["body text on a card", "ink", "surface", 4.5],
  ["muted text on a card", "ink-muted", "surface", 4.5],
  ["muted text on a sunken row", "ink-muted", "surface-sunken", 4.5],
  ["accent link on a card", "accent", "surface", 4.5],
  ["active menu item", "accent-ink", "accent", 4.5],
  ["warning badge text", "warn-ink", "surface", 4.5],
  ["danger badge text", "danger-ink", "surface", 4.5],
];

let failed = 0;
for (const [themeName, selector] of [["light", ":root {"], ["dark", ':root[data-theme="dark"] {']]) {
  const theme = tokens(selector);
  console.log(`\n${themeName}`);
  for (const [label, foreground, background, minimum] of PAIRS) {
    const value = ratio(theme[foreground], theme[background]);
    const ok = value >= minimum;
    if (!ok) failed += 1;
    console.log(
      `   ${ok ? "ok  " : "FAIL"} ${label.padEnd(28)} ${value.toFixed(2)}:1 (needs ${minimum})`,
    );
  }
}

if (failed) {
  console.error(`\n${failed} pair(s) below the threshold`);
  process.exit(1);
}
console.log("\nevery pair passes");
