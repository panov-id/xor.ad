// The feed's pure part (screens/feed-logic.ts) and the place it looks at (place.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { placeOf } from "../place.ts";
import { type FeedCard, type Gone, likeOutcome, mergePage, offerLabel, RADII, radiusWord, toneOf, UNDO_HIDE_MS, visibleCards, widerRadius, withLike } from "./feed-logic.ts";

const c = (id: string, extra: Partial<FeedCard> = {}): FeedCard => ({ id, text: `t${id}`, mode: "alone", lang: "und", like_count: 0, ...extra });

test("widerRadius: the next circle, null at the widest, null for a radius the list does not have", () => {
  assert.equal(widerRadius(100), 300);
  assert.equal(widerRadius(1000), 3000);
  assert.equal(widerRadius(10000), null);
  assert.equal(widerRadius(7 as never), null);
  assert.deepEqual(RADII, [100, 300, 1000, 3000, 10000]);
});

test("radiusWord: metres below a kilometre, kilometres from it", () => {
  assert.deepEqual(radiusWord(300), { key: "web.feed.m", n: 300 });
  assert.deepEqual(radiusWord(1000), { key: "web.feed.km", n: 1 });
  assert.deepEqual(radiusWord(10000), { key: "web.feed.km", n: 10 });
});

test("visibleCards: a table is not drawn, the card that left is gone, the rest keep their order", () => {
  const items = [c("1"), c("2", { kind: "table" }), c("3"), c("4")];
  assert.deepEqual(visibleCards(items, null).map((x) => x.id), ["1", "3", "4"]);
  const gone: Gone = { why: "hidden", id: "3", handle: "h" };
  assert.deepEqual(visibleCards(items, gone).map((x) => x.id), ["1", "4"]);
});

test("mergePage: the first page replaces, a page after the cursor joins, a card on both pages is drawn once", () => {
  const first = [c("1"), c("2")];
  assert.deepEqual(mergePage([c("9")], first).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(mergePage(first, [c("2"), c("3")], "cursor").map((x) => x.id), ["1", "2", "3"]);
});

test("toneOf: lime, yellow, peach in turn; an offer is coral", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => toneOf(c("x"), i)), ["lime", "yellow", "peach", "lime", "yellow"]);
  assert.equal(toneOf(c("x", { offer: { discount_value: "20 %" } }), 0), "coral");
  assert.equal(toneOf(c("x", { kind: "offer" }), 1), "coral");
});

test("offerLabel: any leading minus is dropped, ours is added", () => {
  for (const given of ["20 %", "-20 %", "−20%", "– 20%"]) assert.match(offerLabel(given), /^−\d/);
  assert.equal(offerLabel("-20 %"), "−20 %");
});

test("likeOutcome: 200 liked, 200 matched with the match, 409 stepped_away, 429 rapid, anything else other", () => {
  assert.deepEqual(likeOutcome(200, { state: "liked" }), { state: "liked" });
  assert.deepEqual(likeOutcome(200, null), { state: "liked" });
  assert.deepEqual(likeOutcome(200, { state: "matched", match_id: "m1" }), { state: "matched", matchId: "m1" });
  assert.deepEqual(likeOutcome(409, { error: { code: "stepped_away" } }), { state: "refused", cause: "stepped_away", status: 409 });
  assert.deepEqual(likeOutcome(409, { error: { code: "no_phrase" } }), { state: "refused", cause: "other", status: 409 });
  assert.deepEqual(likeOutcome(429, undefined), { state: "refused", cause: "rapid", status: 429 });
  assert.deepEqual(likeOutcome(500, "boom"), { state: "refused", cause: "other", status: 500 });
});

test("withLike: the card takes one like once, and a liked one stays as it was", () => {
  const once = withLike(c("1", { like_count: 4 }));
  assert.equal(once.like_count, 5);
  assert.equal(once.liked, true);
  assert.equal(withLike(once).like_count, 5);
});

test("the hidden row stands five seconds", () => {
  assert.equal(UNDO_HIDE_MS, 5000);
});

test("placeOf: the web's stored place is read as it is; anything else is no place", () => {
  assert.deepEqual(placeOf('{"lat":41.7,"lon":44.8,"name":"Tbilisi","cc":"GE","source":"city"}'), { lat: 41.7, lon: 44.8, name: "Tbilisi", chosen: true });
  assert.equal(placeOf(null), null);
  assert.equal(placeOf("not json"), null);
  assert.equal(placeOf('{"lat":"41","lon":44,"name":"x"}'), null);
  assert.equal(placeOf('{"lat":41,"lon":44}'), null);
});
