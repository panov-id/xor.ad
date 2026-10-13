// The first tier of §8.3 as a pure reading: what a rule flags in a phrase's
// text and what it lets through. No database — the reading is a function of
// the text alone (lib/feed_verdict.ts, readText); what needs a row (a repeat,
// an offer, a waiting name) is in feed_verdict.test.ts.

import { assertEquals } from "jsr:@std/assert@1";

const { readText } = await import("../src/lib/feed_verdict.ts");
const { judge } = await import("../src/lib/moderator.ts");

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

// W13-RG (open.tsv feed.rules.gaps, "discord: anyone" passed): a messenger
// outside the list is a contact too — bounded as the Latin names are, so a
// word that carries the letters is not the messenger.
Deno.test("a messenger named outside the old list is a contact: discord, signal, skype, imo, threema, дискорд, сигнал", () => {
  for (const text of [
    "discord: anyone?", "Signal me tonight", "skype anna_k", "imo: +anna", "threema id: ABCDEFGH",
    "пиши в дискорд", "в дискорде найдёшь", "сигнал: anna", "есть в сигнале",
  ]) {
    assertEquals(readText(text).includes("contact"), true, text);
  }
  // Bounded: the letters inside another word are not a messenger.
  for (const text of ["skypeglass — это бренд", "discordance in the choir", "imogen придёт", "сигнализация орёт всю ночь", "дискордант"]) {
    assertEquals(readText(text), [], text);
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

// The verdict (lib/moderator.ts judge; owner 13.10.2026: the model alone, no
// person). Model off — the rules decide: nothing flagged publishes, a flag
// refuses with its name, and "offer" alone never refuses (private offers).
Deno.test("no model: the rules decide, and an offer alone is not a refusal", async () => {
  const off = { config: null };
  const clean = await judge({ kind: "phrase", text: "гуляю у реки" }, off);
  assertEquals([clean.publish, clean.by], [true, "rules"]);
  const offer = await judge({ kind: "phrase", text: "скидка соседям", flags: ["offer"] }, off);
  assertEquals(offer.publish, true, `an offer alone was refused: ${offer.reason}`);
  const link = await judge({ kind: "phrase", text: "x", flags: ["offer", "link", "link"] }, off);
  assertEquals([link.publish, link.reason, link.moment], [false, "the phrase was not published: link", true]);
  const line = await judge({ kind: "table_line", text: "x", flags: ["contact"] }, off);
  assertEquals(line.reason, "the line was not published: contact");
});

// Model on — its word is the verdict, whatever the rules flagged, and the
// flags reach it as context. Anything but publish refuses: reject with its
// reason and a moment; unsure, no answer or a 500 closed, without the moment.
Deno.test("model on: publish publishes, anything else refuses, and the rules' flags go to the model", async () => {
  const sent: Record<string, unknown>[] = [];
  const model = (content: string | null): typeof fetch => (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    sent.push(JSON.parse(body.messages.find((m) => m.role === "user")!.content));
    return Promise.resolve(content === null ? new Response("", { status: 500 }) : Response.json({ message: { content } }));
  };
  const config = { url: "http://model", model: "m", timeoutMs: 1000 };
  const on = (content: string | null) => ({ config, fetcher: model(content) });

  const flaggedButFine = await judge(
    { kind: "phrase", text: "скидка 20% соседям", flags: ["offer", "contact"], name: "Аня" },
    on('{"verdict":"publish","reason":"ok"}'),
  );
  assertEquals([flaggedButFine.publish, flaggedButFine.by], [true, "model"], "the model's publish did not publish a flagged phrase");
  assertEquals(sent.at(-1), { kind: "phrase", phrase: "скидка 20% соседям", rule_flags: ["offer", "contact"], name: "Аня" });

  const rejected = await judge({ kind: "name", text: "пиши в тг" }, on('{"verdict":"reject","reason":"a messenger"}'));
  assertEquals([rejected.publish, rejected.reason, rejected.moment], [false, "a messenger", true]);
  const cleanButRejected = await judge({ kind: "table_line", text: "привет" }, on('{"verdict":"reject","reason":""}'));
  assertEquals([cleanButRejected.publish, cleanButRejected.reason], [false, "the moderator refused this line"]);

  const unsure = await judge({ kind: "table_name", text: "x" }, on('{"verdict":"maybe"}'));
  assertEquals([unsure.publish, unsure.moment], [false, false]);
  assertEquals(unsure.reason, "the moderator could not read the table name; try again later");
  const down = await judge({ kind: "phrase", text: "x" }, on(null));
  assertEquals([down.publish, down.moment, down.hint], [false, false, null]);
});
