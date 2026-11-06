// docs/newdesign4 screen 283: the feed's phrase tile is the archive's (nd4/screens/feed-tile*.gen.tsx) at three widths;
// the app gives it the distance from its place, the serif's size by length and the fade (only `soon` leaves the node).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tileFade, tileMetres, type FeedCard } from "./feed-logic.ts";

const card = (over: Partial<FeedCard> = {}): FeedCard => ({ id: "a", text: "x", mode: "m", lang: "en", like_count: 0, ...over });

test("feed tile: the distance runs from the viewer's place to the published centre, none without a point", () => {
  const m = tileMetres(card({ lat: 34.68, lon: 33.05 }), { lat: 34.67, lon: 33.05 });
  assert.ok(m !== null && Math.abs(m - 1112) < 5, `0.01° of latitude is about 1112 m, got ${m}`);
  assert.equal(tileMetres(card(), { lat: 34.67, lon: 33.05 }), null, "a card with no point got a distance");
  assert.equal(tileMetres(card({ lat: 1, lon: 1 }), null), null, "no place yet, still a distance");
  assert.equal(tileMetres(card({ lat: 34.68, lon: 33.05 }), { lat: 34.67, lon: 33.05, chosen: false }), null, "the fallback place gave a distance (owner 06.11)");
});

test("feed tile: the bar is full until the node says soon, short after", () => {
  assert.equal(tileFade(card()), "100%");
  assert.equal(tileFade(card({ soon: true })), "15%");
});

test("feed tile: generated from screen 283 at three widths, every value a slot", () => {
  for (const w of ["", "-tablet", "-laptop"]) {
    const gen = readFileSync(new URL(`../nd4/screens/feed-tile${w}.gen.tsx`, import.meta.url), "utf8");
    assert.match(gen, /screen 283 \(the first phrase tile/, `feed-tile${w}: not from screen 283`);
    for (const slot of ["p.dist", "p.text", "p.fade", "p.likes", "p.onOpen", "p.mine && (", "p.counted && ("]) {
      assert.ok(gen.includes(slot), `feed-tile${w}: no ${slot}`);
    }
    assert.match(gen, /"font": `500 \$\{p\.fs\}\/1\.22/, `feed-tile${w}: the serif's size is fixed`);
    for (const left of ["350 m", "Swim at 7", "width\": '70%'"]) assert.ok(!gen.includes(left), `feed-tile${w}: the archive's ${left} left in`);
  }
  const tile = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(tile, /fs=\{FEED_TILE_FS\[textSize\(card\.text\)\]\}/, "feed-card.tsx: the size is not by the text's length");
  assert.match(tile, /dist=\{dist \?\? \(w \? say\(w\.key/, "feed-card.tsx: the distance is not said");
});

test("feed tile: no app rule on a bare .tile reaches the archive's tile (the old splash's centred absolute box did)", () => {
  const css = readFileSync(new URL("./screens.css", import.meta.url), "utf8");
  const bare = [...css.matchAll(/(^|\})\s*([^{}@]*\.tile\b[^{}]*)\{/g)].map((m) => m[2].trim()).filter((sel) => !/\.tile:not\(article, \.scr \.tile\)/.test(sel));
  assert.deepEqual(bare, [], "screens.css: a .tile rule that also takes the archive's tiles");
});
