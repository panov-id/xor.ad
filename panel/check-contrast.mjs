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

// Four blocks define values, not two: the default :root, the dark media query,
// and the two explicit [data-theme] choices. Only the explicit pair used to be
// counted — the two a person gets *after* touching the toggle. The two nobody
// checked are what everybody sees *before* touching it, which is most people.
//
// Braces are matched rather than assumed, because the dark media query nests its
// :root one level in and the old "find the next \n}" would have stopped early.
function blockAt(from) {
  const open = css.indexOf("{", from);
  if (open === -1) throw new Error("no block after index " + from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return { body: css.slice(open + 1, i), end: i };
  }
  throw new Error("unbalanced braces in App.css");
}

// A path of selectors: each is searched for after the previous one, so
// ["@media (prefers-color-scheme: dark)", ":root"] reaches the nested block.
function tokensOf(path) {
  let at = 0;
  for (const selector of [path].flat()) {
    at = css.indexOf(selector, at);
    if (at === -1) throw new Error(`no ${selector} block in App.css`);
  }
  const tokens = {};
  for (const [, name, value] of blockAt(at).body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
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
  ["accent-ink", "accent", "the label inside a filled button"],
  ["warn-ink", "surface", "a warning badge on a card"],
  ["danger-ink", "surface", "an error, and the status of a failed form"],
  ["ok-ink", "surface", "the status of a form that worked"],
];

const THRESHOLD = 4.5;
let failed = 0;

for (const [selector, theme] of [
  [":root {", "default (light, before the toggle is touched)"],
  [["@media (prefers-color-scheme: dark)", ":root"], "system dark (before the toggle is touched)"],
  [':root[data-theme="light"]', "light (chosen)"],
  [':root[data-theme="dark"]', "dark (chosen)"],
]) {
  const tokens = tokensOf(selector);
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
