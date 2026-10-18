// The talks screens' rules (talks-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isFresh, lineOf, ringOf, splitInbox, type TalkRow } from "./talks-logic.ts";

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
