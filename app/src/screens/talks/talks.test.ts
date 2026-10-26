// The talks screens' rules (talks-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canTakeBack, chatRowOf, INBOX_BACKOFF_MS, type InboxRoom, listenInbox, marksSeen, distanceWord, goneIn, isFresh, lineOf, matchView, metresBetween, ringOf, splitInbox, type LikedRow, type MatchRow, type TalkRow } from "./talks-logic.ts";

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

test("a talk opens a chat only with the node's whole row: the keys' part and my span; a row without them opens none", () => {
  const whole = { kind: "chat", id: "c1", me: "id-me", key_epoch: 1, rekey_requested: false, name: "Nino", age: 27, state: "open", chat_expires_at: 2_000, my_span: 60,
    peer: { key_epoch: 1, identity_id: "id-nino", identity_public_key: "pk" } };
  assert.equal(chatRowOf(whole)?.id, "c1");
  assert.equal(chatRowOf(whole), whole, "the same row, not a copy that loses fields");
  assert.equal(chatRowOf({ ...whole, peer: undefined }), null, "no peer key: no chat");
  assert.equal(chatRowOf({ ...whole, my_span: undefined }), null);
  assert.equal(chatRowOf({ ...whole, kind: "match" }), null);
  assert.equal(chatRowOf(talk()), null, "the list's few fields are not a chat");
});

// Owner 2026-10-26 (crowd runs 8-11; «Сразу канал узла»): a person standing on «Chats» never saw the chat the other
// side opened later. The list keeps the node's room open and reads again on its frames.
test("the open chats list listens to the node's channel, not a timer", () => {
  const screen = readFileSync(new URL("./Inbox.tsx", import.meta.url), "utf8");
  assert.match(screen, /listenInbox\(\(\) => client\.openInbox\(\), \(\) => load\("signal"\)\)/, "Inbox.tsx does not listen to the chats list's room");
  assert.match(screen, /stop\(\);/, "the chats list's room outlives the screen");
  assert.doesNotMatch(screen, /setInterval/, "a timer is back on the chats list");
});

type Fake = { frames: Array<{ type: string }>; close: () => void; room: InboxRoom; closedBy: number[] };
function fakeRoom(): Fake {
  let shut: (code: number) => void = () => {};
  const frames: Array<{ type: string }> = [];
  const waiting: Array<(f: { type: string }) => void> = [];
  const closedBy: number[] = [];
  const room: InboxRoom = {
    next: () => { const f = frames.shift(); return f ? Promise.resolve(f) : new Promise((r) => waiting.push(r)); },
    closed: new Promise((r) => (shut = r)),
    close: () => { closedBy.push(1000); shut(1000); },
  };
  return { frames: new Proxy(frames, { get(a, k) { if (k === "push") return (f: { type: string }) => { const w = waiting.shift(); if (w) w(f); else a.push(f); return a.length; }; return Reflect.get(a, k); } }), close: () => shut(1006), room, closedBy };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("an inbox frame reads the list again; other frames are passed by", async () => {
  const fake = fakeRoom();
  let reads = 0;
  const stop = listenInbox(async () => fake.room, () => { reads++; }, () => new Promise(() => {}));
  await tick();
  fake.frames.push({ type: "inbox" });
  await tick();
  assert.equal(reads, 1, "an inbox frame did not read the list");
  fake.frames.push({ type: "name_verdict" });
  await tick();
  assert.equal(reads, 1, "a session frame in the list's room read the list");
  stop();
  assert.deepEqual(fake.closedBy, [1000], "leaving the screen left the room open");
});

test("a dropped room is opened again after the backoff, and a refused ticket waits too", async () => {
  const rooms = [fakeRoom(), fakeRoom()];
  let opened = 0;
  const waits: number[] = [];
  const stop = listenInbox(async () => {
    const r = rooms[opened++];
    if (!r) throw new Error("no ticket");
    return r.room;
  }, () => {}, (ms) => { waits.push(ms); return waits.length < 6 ? tick() : new Promise(() => {}); });
  await tick();
  rooms[0].close();
  for (let k = 0; k < 5; k++) await tick();
  assert.equal(opened >= 2, true, "a dropped room was never opened again");
  assert.equal(waits[0], INBOX_BACKOFF_MS[0], "the room came back with no pause");
  rooms[1].close();
  for (let k = 0; k < 10; k++) await tick();
  assert.equal(waits.length >= 3, true, "a refused ticket was tried again with no pause");
  assert.equal(waits[2] > waits[1], true, "the pause did not grow");
  stop();
});

// Panel 2026-10-26: the list's timer (now the node's signal) marked rows seen, and «new» went out within a minute with nobody looking.
test("only a person's look marks the chats list seen, never the node's signal", () => {
  assert.equal(marksSeen("open", true), true, "opening the chats screen no longer marks it seen");
  assert.equal(marksSeen("focus", true), true, "coming back to the window no longer marks it seen");
  assert.equal(marksSeen("signal", true), false, "the node's signal marks rows seen: «new» goes out with nobody looking");
  assert.equal(marksSeen("open", false), false, "the desktop pane (mark off) marks the list seen");
});
