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

// The measurement of 2026-09-27 (docs/measurements/feed-rules-2026-09-27,
// scripts/measure-feed-rules.sh): what passed the rules and was closed, and
// what passed and is left as the rules' named boundary — a test each, so the
// line is written in code, not in words.
Deno.test("the passes the measurement closed: a bracketed dot, a Cyrillic top-level label, тг", () => {
  for (const text of ["заходите на example[.]com", "example(.)com", "сайт пример.рф", "ссылку скину, пример.ру", "домен.укр", "сайт.бел"]) {
    assertEquals(readText(text), ["link"], text);
  }
  for (const text of ["пиши в тг", "пиши в личку тг", "тг: anna"]) {
    assertEquals(readText(text), ["contact"], text);
  }
});

Deno.test("the boundaries the measurement named, kept: a bare dot as a word, spaces around a dot, digits in words", () => {
  // Each of these passed the rules on 2026-09-27 and stays a phrase for a
  // person to read: catching it would catch ordinary speech with it.
  for (const text of [
    "example dot com — там всё", // "dot" as a bare word: "a dot of humour" is a phrase
    "example . com, вечером", // a sentence ends with a dot and a space
    "www example com", // no dot at all
    "example.c0m", // a digit in the label: not a top-level label
    "телефон девять девять девять один два три", // digits in words
    "mail: anna @ mail . ru", // spaces around @
    "конец.Начало", // a typo, not a host: the Cyrillic labels are a closed list
    "тгк — это канал", // тг inside a longer word is not the messenger
  ]) {
    assertEquals(readText(text), [], text);
  }
});

Deno.test("the widened rules read 100 KB of the worst shapes in time that grows with the length, not its square", () => {
  // As B106 measured the scrub: the phrase is 128 graphemes on the node, but a
  // regex is judged on what it would do with more. Judged by growth, not by
  // milliseconds: an absolute ceiling of 50 ms went red on a machine under load
  // (load average 36 on 8 cores, 27.09.2026) while the rules were as linear as
  // ever. Eight times the text takes about eight times as long when linear and
  // sixty-four when quadratic; both lengths are read in the same run, so a busy
  // machine slows them alike.
  const shapes = ["a.", "[.]", "тг ", "пример.рф ", "(.)a", "-."];
  const GROWTH = 8;
  const fastest = (text: string) => {
    let best = Infinity;
    for (let round = 0; round < 5; round++) {
      const started = performance.now();
      readText(text);
      best = Math.min(best, performance.now() - started);
    }
    return Math.max(best, 0.05); // below the timer's grain the ratio is noise
  };
  for (const shape of shapes) {
    const long = Math.floor(100_000 / shape.length);
    const small = fastest(shape.repeat(long / GROWTH));
    const large = fastest(shape.repeat(long));
    const ratio = large / small;
    assertEquals(
      ratio < GROWTH * 3, true,
      `"${shape}" ×${long}: ${large.toFixed(1)} ms against ${small.toFixed(1)} ms at an eighth — ${ratio.toFixed(1)}× for 8× the text`,
    );
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
