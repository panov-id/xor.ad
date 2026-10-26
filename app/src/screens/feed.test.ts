// The feed's pure part (screens/feed-logic.ts) and the place it looks at (place.ts).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { placeOf } from "../place.ts";
import { cardEntry, cardOf, feedRows, matchesQuery, peerName, sentOf, stepKey, stepOf, STEPS, takedownVerdict, withoutCard, type FeedCard, type Gone, likeOutcome, mergePage, offerLabel, RADII, radiusWord, toneOf, UNDO_HIDE_MS, visibleCards, widerRadius, withLike } from "./feed-logic.ts";

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

test("cardEntry/cardOf: an open card is one history entry deeper and names its card; any other entry names none", () => {
  const e = cardEntry({ gate: "feed", i: 0 }, "p1");
  assert.deepEqual(e, { gate: "feed", i: 1, card: "p1" });
  assert.equal(cardOf(e), "p1");
  assert.equal(cardOf({ gate: "feed", i: 0 }), null);
  assert.equal(cardOf(null), null);
  assert.equal(cardOf({ card: "" }), null);
  assert.deepEqual(cardEntry(null, "p2"), { gate: "feed", i: 1, card: "p2" });
});

test("withoutCard: a stale card entry keeps its place in history but names no card; other entries pass as they are", () => {
  assert.deepEqual(withoutCard({ gate: "feed", i: 1, card: "p1" }), { gate: "feed", i: 1 });
  const plain = { gate: "feed", i: 0 };
  assert.equal(withoutCard(plain), plain);
  assert.equal(withoutCard(null), null);
});

test("matchesQuery: case and edge spaces do not matter, an empty query holds all, a table is found by its name", () => {
  assert.equal(matchesQuery(c("1", { text: "Backgammon in the yard" }), "  BACK "), true);
  assert.equal(matchesQuery(c("1", { text: "Backgammon in the yard" }), "ladder"), false);
  assert.equal(matchesQuery(c("1"), "   "), true);
  assert.equal(matchesQuery(c("2", { kind: "table", text: "", name: "Evening at the yard" }), "evening"), true);
  assert.equal(matchesQuery(c("2", { kind: "table", text: "yard", name: null }), "yard"), false);
});

test("feedRows: tables stay between the phrases, the tones count phrases only, the gone card and the search drop rows", () => {
  const items = [c("1"), c("2", { kind: "table", name: "T" }), c("3"), c("4"), c("5")];
  const rows = feedRows(items, null);
  assert.deepEqual(rows.map((r) => r.card.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(rows.map((r) => r.tone), ["lime", null, "yellow", "peach", "lime"]);
  assert.deepEqual(feedRows(items, { why: "blocked", id: "3" }).map((r) => [r.card.id, r.tone]), [["1", "lime"], ["2", null], ["4", "yellow"], ["5", "peach"]]);
  assert.deepEqual(feedRows([c("1", { text: "cat" }), c("2", { text: "dog" }), c("3", { kind: "table", name: "cat table" })], null, "cat").map((r) => r.card.id), ["1", "3"]);
});

test("stepOf: a step of the contract only, on 200 only; the word for it is web.nearby.<step>", () => {
  for (const s of STEPS) assert.equal(stepOf(200, { step: s }), s);
  assert.equal(stepOf(200, { step: "dozens" }), null);
  assert.equal(stepOf(200, { step: 12 }), null);
  assert.equal(stepOf(200, null), null);
  assert.equal(stepOf(429, { step: "tens" }), null);
  assert.equal(stepKey("about_ten"), "web.nearby.about_ten");
});

test("sentOf and takedownVerdict: the id stays only when the node gave one; only 204 is a phrase taken down", () => {
  assert.deepEqual(sentOf({ state: "published", id: "p1" }, "hi"), { state: "published", text: "hi", id: "p1" });
  assert.deepEqual(sentOf({ state: "checking", id: "" }, "hi"), { state: "checking", text: "hi" });
  assert.deepEqual(takedownVerdict(204), { ok: true });
  assert.deepEqual(takedownVerdict(404), { ok: false, status: 404 });
  assert.deepEqual(takedownVerdict(0), { ok: false, status: 0 });
});

test("peerName: the match's own row by the like's match id; a chat with the same id, a blank name or no id say nothing", () => {
  const rows = [{ kind: "chat", id: "m1", name: "Dato" }, { kind: "match", id: "m1", name: "Nino" }, { kind: "match", id: "m2", name: "  " }];
  assert.equal(peerName(rows, "m1"), "Nino");
  assert.equal(peerName(rows, "m2"), null);
  assert.equal(peerName(rows, "m9"), null);
  assert.equal(peerName(rows, undefined), null);
});

// Owner 2026-10-26 (crowd run flow-1026-125809): on a desktop the phrase had no «…», so no report, hide or block.
test("no width hides the phrase's «…»: report, hide and block have no other way in", () => {
  const dir = new URL("../../tokens/", import.meta.url), files = readdirSync(dir).filter((f) => f.endsWith(".css"));
  assert.ok(files.length >= 10, `only ${files.length} token stylesheets found`);
  const css = files.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  const rules = [...css.matchAll(/([^{}]*more-menu[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length > 0, "no rule names more-menu: look again where the phrase's «…» is laid out");
  for (const [, sel, body] of rules) assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden/, `${sel.trim()} hides the «…»`);
});
