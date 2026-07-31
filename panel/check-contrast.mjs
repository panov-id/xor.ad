// Contrast of the panel's tokens, counted rather than assumed.
//
// The same idea as the storefronts' check-contrast.mjs, pointed at a different
// palette: read the token values straight out of App.css, pair every ink with
// the surface it is actually printed on, and fail below 4.5:1 (WCAG AA for body
// text). The pairs are listed here rather than discovered, because "which
// background is this text on" is a fact about the layout, not about the file.
//
//   node check-contrast.mjs
//
// Why it exists: five colours in this stylesheet were written as hex and so kept
// their light-theme values on a near-black page. Nothing said so until the
// numbers were counted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "src/App.css"), "utf8");

// One block defines the values now: every colour is a light-dark(a, b) pair in
// :root, and the theme is chosen by stamping a color-scheme. So this reads that
// one block and resolves it twice — which is also the only way left for the two
// themes to disagree about which tokens exist, since they are written together.
//
// Braces are matched rather than assumed: the block runs past nested comments and
// the old "find the next \n}" would have stopped early.
function blockAt(from) {
  const open = css.indexOf("{", from);
  if (open === -1) throw new Error("no block after index " + from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces in App.css");
}

const PAIR = /^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/;

// A token that is not a pair is the same in both themes; one that is resolves to
// its first value in light and its second in dark, exactly as the browser does.
function tokensOf(theme) {
  const at = css.indexOf(":root {");
  if (at === -1) throw new Error("no :root block in App.css");
  const body = blockAt(at).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  for (const [, name, raw] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const value = raw.trim();
    const pair = value.match(PAIR);
    tokens[name] = pair ? (theme === "dark" ? pair[2] : pair[1]) : value;
  }
  return tokens;
}

function channel(component) {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground, background) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// ink → the surface it is printed on. A token that is only ever a border (the
// --*-line pair) is not here: a 1px rule is not body text and AA does not ask
// the same of it.
const PAIRS = [
  ["ink", "page", "body text on the page"],
  ["ink", "surface", "body text on a card"],
  ["ink", "surface-sunken", "body text in a field"],
  ["ink-muted", "surface", "muted text on a card"],
  ["ink-muted", "surface-sunken", "muted text in a table head"],
  ["ink-muted", "page", "breadcrumbs on the page"],
  ["accent", "surface", "a link or a badge on a card"],
  ["ink", "surface-hover", "a label on the button under the pointer"],
  ["accent-ink", "accent", "the label inside a filled button"],
  ["accent-ink", "accent-hover", "the same label, under the pointer"],
  ["warn-ink", "surface", "a warning badge on a card"],
  ["danger-ink", "surface", "an error, and the status of a failed form"],
  ["ok-ink", "surface", "the status of a form that worked"],
];

const THRESHOLD = 4.5;
let failed = 0;

// Two, not four: chosen and inherited-from-the-system are the same values now,
// because there is only one place the values are written.
for (const theme of ["light", "dark"]) {
  const tokens = tokensOf(theme);
  console.log(`\n${theme}`);
  for (const [inkName, surfaceName, what] of PAIRS) {
    const ink = tokens[inkName];
    const surface = tokens[surfaceName];
    if (!ink || !surface) {
      console.log(`  ?     --${inkName} on --${surfaceName}: not defined in this theme`);
      failed++;
      continue;
    }
    const value = ratio(ink, surface);
    const ok = value >= THRESHOLD;
    if (!ok) failed++;
    console.log(
      `  ${ok ? "ok  " : "FAIL"}  ${value.toFixed(2)}:1  --${inkName} on --${surfaceName}  (${what})`,
    );
  }
}

console.log(
  failed === 0
    ? `\nall pairs at ${THRESHOLD}:1 or better`
    : `\n${failed} pair(s) below ${THRESHOLD}:1`,
);
process.exit(failed === 0 ? 0 : 1);
