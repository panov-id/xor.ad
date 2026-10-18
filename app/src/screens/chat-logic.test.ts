// chat-logic.ts: the conversation screen's clock, header line, ring, chips and sides.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bubblesOf, clockOf, headerLine, QUICK_STICKERS, ringOf, spanWord } from "./chat-logic.ts";

const NOW = 1_800_000_000;

test("clockOf: hours and minutes, 24 h, in the given zone", () => {
  // 1_800_000_000 is 2027-01-15 08:00:00 UTC
  assert.equal(clockOf(NOW, "en-GB", "UTC"), "08:00");
  assert.equal(clockOf(NOW + 13 * 3600 + 60, "ru", "UTC"), "21:01");
});

test("headerLine: the minutes left of the silence, rounded up, never below one while it runs", () => {
  assert.deepEqual(headerLine({ over: false, endsAt: NOW + 38 * 60 }, NOW), { key: "app.chat.fades", values: { m: 38 } });
  assert.deepEqual(headerLine({ over: false, endsAt: NOW + 61 }, NOW), { key: "app.chat.fades", values: { m: 2 } });
  assert.deepEqual(headerLine({ over: false, endsAt: NOW + 5 }, NOW), { key: "app.chat.fades", values: { m: 1 } });
  assert.deepEqual(headerLine({ over: false, endsAt: NOW - 5 }, NOW), { key: "app.chat.fades", values: { m: 1 } });
});

test("headerLine: an ended chat says so, whatever the clock", () => {
  assert.deepEqual(headerLine({ over: true, endsAt: NOW + 600 }, NOW), { key: "app.chat.ended" });
});

test("ringOf: minutes left and the share of the span left", () => {
  assert.deepEqual(ringOf(NOW + 30 * 60, 60, NOW), { minutes: 30, left: 0.5 });
  assert.deepEqual(ringOf(NOW - 1, 60, NOW), { minutes: 0, left: 0 });
  assert.deepEqual(ringOf(NOW + 120 * 60, 60, NOW), { minutes: 120, left: 1 });
});

test("QUICK_STICKERS: three of the shared set, in the sheet's order", () => {
  assert.deepEqual([...QUICK_STICKERS], ["hi", "coffee", "deal"]);
});

test("bubblesOf: theirs left, mine right, an extra like and a system line in the middle", () => {
  const b = bubblesOf([
    { id: "1", text: "a", mine: false, at: NOW },
    { id: "2", text: "b", mine: true, at: NOW },
    { id: "3", text: "c", mine: false, at: NOW, system: true },
    { id: "4", text: "d", mine: false, at: NOW, extra: { position: 1, direction: "they_liked_yours" } },
  ]);
  assert.deepEqual(b.map((x) => x.side), ["theirs", "mine", "middle", "middle"]);
});

test("spanWord: minutes under an hour, hours from there (w3_chat-more «1 h»)", () => {
  assert.deepEqual(spanWord(10), { key: "app.chat.span_min", values: { n: 10 } });
  assert.deepEqual(spanWord(30), { key: "app.chat.span_min", values: { n: 30 } });
  assert.deepEqual(spanWord(60), { key: "app.chat.span_h", values: { n: 1 } });
  assert.deepEqual(spanWord(260), { key: "app.chat.span_h", values: { n: 4 } });
});
