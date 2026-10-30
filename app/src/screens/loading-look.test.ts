// The loading screen by docs/newdesign4 14: the name card of 01 with no «share» and no legal line, a thin bar with a
// running stripe and «Finding your street…». Read from the sources.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("loading 14: the bare name card, the bar and the street line", () => {
  const loading = read("./Loading.tsx");
  assert.match(loading, /<NameCard bare line=\{/, "Loading.tsx does not stand on the bare name card");
  assert.match(loading, /className="nd-bar"[\s\S]{0,120}data-testid="loading">\{say\("app\.loading\.street"\)\}/, "the bar or «Finding your street…» is gone");
  const card = read("./Splash.tsx");
  assert.match(card, /\{!bare && \(\s*<button[^>]*nd-round/, "«share» shows on the bare card");
  assert.match(card, /\{!bare && <div className="nd-legal">/, "Terms · Privacy show on the bare card");
  const css = read("../../tokens/nd4.css");
  assert.match(css, /\.nd-bar > i \{[^}]*animation: nd-wait 1\.6s ease-in-out infinite/, "the stripe does not run");
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.nd-bar > i \{ animation: none/, "the stripe runs for people who asked for less motion");
});
