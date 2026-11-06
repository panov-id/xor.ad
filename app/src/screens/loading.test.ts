import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gen = (s: string) => readFileSync(new URL(`../nd4/screens/loading${s}.gen.tsx`, import.meta.url), "utf8");

test("screen 14 loading: the archive's screen at each width, its words from props, no archive script or text", () => {
  for (const s of ["", "-tablet", "-laptop"]) {
    const g = gen(s), body = g.split("\n").slice(1).join("\n");
    assert.match(g, /role="status" data-testid="loading"/, `loading${s}: the status line`);
    assert.match(g, /\{p\.text\}/, `loading${s}: the words come from props`);
    assert.doesNotMatch(body, /<script|Finding your street|9:41|>sosed</, `loading${s}: archive text or script left`);
  }
  const src = readFileSync(new URL("./Loading.tsx", import.meta.url), "utf8");
  assert.match(src, /wide === "laptop" \? LoadingScreenLaptop : wide === "tablet" \? LoadingScreenTablet : LoadingScreen/);
  assert.match(src, /data-bare=""/, "the frame is the window");
  assert.match(src, /brand=\{brand\.name\}/, "the brand's own name, not the archive's");
  assert.match(src, /const wide = useDrawing\(\);/, "the drawing by the shared width rule");
});

test("screen 15 update: the archive's screen at each width, every press live, no archive text", () => {
  const up = (x: string) => readFileSync(new URL(`../nd4/screens/update${x}.gen.tsx`, import.meta.url), "utf8");
  for (const x of ["", "-tablet", "-laptop"]) {
    const g = up(x), body = g.split("\n").slice(1).join("\n");
    for (const t of ["update-close", "update-later", "update-go", "update-line"]) assert.match(g, new RegExp(`data-testid="${t}"`), `update${x}: ${t}`);
    assert.match(g, /id="update-title"/, `update${x}: the dialog's title`);
    assert.doesNotMatch(body, /<script|A new sosed|v 1\.1|>Later<|>Update<|9:41/, `update${x}: archive text left`);
  }
  const src = readFileSync(new URL("./Update.tsx", import.meta.url), "utf8");
  assert.match(src, /role="dialog" aria-modal="true" aria-labelledby="update-title"/);
  assert.match(src, /onGo=\{\(\) => location\.reload\(\)\}/);
});

test("the shared drawing rule: laptop from --bp-desktop, tablet from 600", () => {
  const d = readFileSync(new URL("../nd4/drawing.ts", import.meta.url), "utf8");
  assert.match(d, /export const TABLET_FROM = 600;/);
  assert.match(d, /return desk \? "laptop" : tab \? "tablet" : "phone";/);
});
