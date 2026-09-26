// The first tier of §8.3 as a pure reading: what a rule flags in a phrase's
// text and what it lets through. No database — the reading is a function of
// the text alone (lib/feed_verdict.ts, readText); what needs a row (a repeat,
// an offer, a waiting name) is in feed_verdict.test.ts.

import { assertEquals } from "jsr:@std/assert@1";

const { readText, verdictMode } = await import("../src/lib/feed_verdict.ts");

const clean = [
  "гуляю у реки, если кто рядом",
  "meet at the bridge at 7, bring a dot of humour",
  "3.5 km jog around the park, anyone?",
  "продам табуретку, две штуки. пишите здесь",
  "кофе в 18:30 у фонтана",
  "e.g. a walk, i.e. slowly",
  "🍕 пицца на троих, зову",
];

const flagged: Array<[string, string]> = [
  ["https://example.com/party", "link"],
  ["www.example.org", "link"],
  ["пишите на t.me/anyone", "link"],
  ["site точка ru жду", "link"],
  ["ｔ．ｍｅ／anyone", "link"], // fullwidth, read as t.me/anyone after NFKC
  ["t​.me/anyone", "link"], // a zero-width space inside the host
  ["anyone@example.com", "contact"],
  ["name (at) mail (dot) com", "contact"],
  ["пиши @anyone_here", "contact"],
  ["я в телеге: спроси", "contact"],
  ["find me on WhatsApp", "contact"],
  ["+7 999 123-45-67", "contact"],
  ["звони 8(999)1234567", "contact"],
  ["encontrémonos, 555 123 4567", "contact"],
];

Deno.test("a clean phrase reads as nothing", () => {
  for (const text of clean) assertEquals(readText(text), [], text);
});

Deno.test("a link or a contact is flagged, whichever way it is spelled", () => {
  for (const [text, reason] of flagged) {
    assertEquals(readText(text).includes(reason as "link" | "contact"), true, `${text} → ${reason}`);
  }
});

Deno.test("a short number is not a telephone; seven digits are", () => {
  assertEquals(readText("в 18:30, дом 12-14"), []);
  assertEquals(readText("123456"), []);
  assertEquals(readText("1234567"), ["contact"]);
});

Deno.test("the rules read in linear time on the longest phrase a node takes", () => {
  // 128 graphemes of the worst shapes for a backtracking regex: dots, digits
  // and separators (B106 — a raw Origin of 60 KB once stalled the node).
  const worst = [
    "a.".repeat(64),
    "1-".repeat(64),
    "a@".repeat(64),
    "(".repeat(128),
    "1 ".repeat(64),
    "-.".repeat(64),
  ];
  const started = performance.now();
  for (let round = 0; round < 200; round++) for (const text of worst) readText(text);
  const took = performance.now() - started;
  assertEquals(took < 2000, true, `1200 readings took ${Math.round(took)} ms`);
});

Deno.test("the mode is rules unless the node says queue; a misspelling is queue", () => {
  const had = Deno.env.get("FEED_VERDICT");
  try {
    Deno.env.delete("FEED_VERDICT");
    assertEquals(verdictMode(), "rules");
    Deno.env.set("FEED_VERDICT", "queue");
    assertEquals(verdictMode(), "queue");
    Deno.env.set("FEED_VERDICT", "RULES ");
    assertEquals(verdictMode(), "rules");
    Deno.env.set("FEED_VERDICT", "rule");
    assertEquals(verdictMode(), "queue");
  } finally {
    if (had === undefined) Deno.env.delete("FEED_VERDICT");
    else Deno.env.set("FEED_VERDICT", had);
  }
});
