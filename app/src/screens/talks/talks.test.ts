// The talks screens' rules (talks-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canTakeBack, distanceWord, goneIn, isFresh, lineOf, matchView, metresBetween, ringOf, splitInbox, type LikedRow, type MatchRow, type TalkRow } from "./talks-logic.ts";

const talk = (over: Partial<TalkRow> = {}): TalkRow => ({ kind: "chat", id: "c", name: "Nino", age: 27, state: "open", chat_expires_at: 10_000, ...over });

test("inbox: offers go to the strip, talks to the rows, in the node's order; anything else is left out", () => {
  const rows = [talk({ id: "c1" }), { kind: "match", id: "m1", name: "Dato", age: 30, waiting_for_you: true }, talk({ id: "c2" }), { kind: "ad" }];
  const { offers, talks } = splitInbox(rows);
  assert.deepEqual(offers.map((o) => o.id), ["m1"]);
  assert.deepEqual(talks.map((t) => t.id), ["c1", "c2"]);
});
test("inbox: new is an offer arrived or answered, a talk opened or with lines waiting", () => {
  assert.equal(isFresh({ kind: "match", id: "m", name: "", age: 0, waiting_for_you: false }), false);
  assert.equal(isFresh({ kind: "match", id: "m", name: "", age: 0, waiting_for_you: false, answered_since: true }), true);
  assert.equal(isFresh(talk()), false);
  assert.equal(isFresh(talk({ pending_messages: 2 })), true);
  assert.equal(isFresh(talk({ pending_messages: 0, opened_since: true })), true);
});
test("ring: whole minutes left of the hour of silence, rounded up; none once ended or run out", () => {
  assert.deepEqual(ringOf(talk({ chat_expires_at: 10_000 + 38 * 60 }), 10_000), { minutes: 38, share: 38 / 60 });
  assert.equal(ringOf(talk({ chat_expires_at: 10_001 }), 10_000)?.minutes, 1, "a second left is still a minute, not 0");
  assert.equal(ringOf(talk({ chat_expires_at: 10_000 + 2 * 3600 }), 10_000)?.share, 1, "never more than the hour");
  assert.equal(ringOf(talk({ chat_expires_at: 9_000 }), 10_000), null);
  assert.equal(ringOf(talk({ state: "ended", chat_expires_at: 20_000 }), 10_000), null);
});

const words: Record<string, string> = { "web.inbox.waits_you": "waits", "app.talks.closed": "closed", "app.talks.open": "open" };
const say = (k: string) => words[k] ?? k;
test("a talk's line: lines waiting for me first (even on an ended talk), then ended, then open", () => {
  assert.equal(lineOf(talk({ pending_messages: 1, state: "ended" }), say), "waits");
  assert.equal(lineOf(talk({ pending_messages: 0, state: "ended" }), say), "closed");
  assert.equal(lineOf(talk(), say), "open");
});

test("distance: haversine metres — a degree of latitude is 111.2 km, the same point is 0", () => {
  assert.equal(Math.round(metresBetween({ lat: 41, lon: 44 }, { lat: 42, lon: 44 }) / 100) / 10, 111.2);
  assert.equal(metresBetween({ lat: 41.69, lon: 44.8 }, { lat: 41.69, lon: 44.8 }), 0);
  assert.ok(Math.abs(metresBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111_195) < 5, "a degree of longitude on the equator");
});
test("distance words: tens of metres (never 0), a decimal of km under ten, whole km above", () => {
  assert.deepEqual(distanceWord(3), { key: "web.feed.m", n: 10 });
  assert.deepEqual(distanceWord(104), { key: "web.feed.m", n: 100 });
  assert.deepEqual(distanceWord(996), { key: "web.feed.km", n: 1 });
  assert.deepEqual(distanceWord(2349), { key: "web.feed.km", n: 2.3 });
  assert.deepEqual(distanceWord(12_600), { key: "web.feed.km", n: 13 });
});
test("a liked card's hand takes the like back only while it is a like: not matched, not spent, not an offer", () => {
  const liked: LikedRow = { id: "p", text: "", mode: "alone", like_count: 1, state: "liked", liked_at: 0 };
  assert.equal(canTakeBack(liked, false), true);
  assert.equal(canTakeBack({ ...liked, state: "matched" }, false), false);
  assert.equal(canTakeBack(liked, true), false);
  assert.equal(canTakeBack({ ...liked, offer: { discount_value: "10%" } }, false), false);
});

test("a match: offer, or they agreed already; declined here; my yes waits, and is gone once they said not now", () => {
  const row: MatchRow = { kind: "match", id: "m", name: "Nino", age: 27, waiting_for_you: false, phrase: { text: "Backgammon tonight?", mode: "alone" } };
  const here = { agreed: false, declined: false };
  assert.equal(matchView(row, here), "offer");
  assert.equal(matchView({ ...row, waiting_for_you: true }, here), "they-agreed");
  assert.equal(matchView(row, { ...here, declined: true }), "declined");
  assert.equal(matchView(row, { ...here, agreed: true }), "waiting");
  assert.equal(matchView({ ...row, my_consent: "waiting" }, here), "waiting", "after a reload the node remembers my yes");
  assert.equal(matchView({ ...row, my_consent: "gone" }, here), "gone");
  assert.equal(matchView({ ...row, my_consent: "gone" }, { ...here, gone: false }), "waiting", "their undo brings the wait back");
});

test("a wait: gone once the other said not now, back on their undo; a match not in the list keeps the last word", () => {
  const row = (my_consent: MatchRow["my_consent"]): MatchRow => ({ kind: "match", id: "m1", name: "Nino", age: 27, waiting_for_you: false, phrase: { text: "", mode: "alone" }, my_consent });
  assert.equal(goneIn([row("waiting")], "m1", false), false);
  assert.equal(goneIn([talk(), row("gone")], "m1", false), true);
  assert.equal(goneIn([row("waiting")], "m1", true), false, "their undo brings the wait back");
  assert.equal(goneIn([talk()], "m1", true), true);
  assert.equal(goneIn([{ ...row("gone"), id: "m2" }], "m1", false), false, "another match's word is not mine");
});
