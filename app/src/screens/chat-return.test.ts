// Leaving a talk and coming back (owner 03.11.2026): read lines stay in the seat's memory, never on disk.
// The session's half is in depth/web-platform/chat/chat_state.test.ts; this holds the wiring, every <Chat> App.tsx mounts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const app = read("../shell/App.tsx");
const chat = read("./Chat.tsx");

test("every Chat in App.tsx is given the seat's held lines", () => {
  const mounts = app.match(/<Chat [^\n]*?\/>/g) ?? [];
  assert.ok(mounts.length >= 2, `expected the phone and the wide mount, found ${mounts.length}`);
  for (const m of mounts) assert.match(m, /held=\{heldLines\}/, `a Chat without held lines loses read lines on leaving: ${m}`);
});

test("the held lines go with the seat", () => {
  assert.match(app, /heldLines = useMemo\(\(\) => new Map<string, Line\[\]>\(\), \[seated\?\.client\]\)/, "held lines must be reset when the seat changes");
});

test("Chat starts from the held lines and leaves them on unmount, before stopping", () => {
  assert.match(chat, /lines: held\.get\(row\.id\)/, "a returning Chat must start from what was held");
  const set = chat.indexOf("held.set(row.id, session.heldLines())");
  const stop = chat.indexOf("session.stop()");
  assert.ok(set > 0 && set < stop, "the lines must be held on unmount, before session.stop()");
  assert.match(chat, /over\) held\.delete\(row\.id\)/, "an ended talk must leave memory");
});

test("no disk: the lines reach no storage", () => {
  for (const [name, src] of [["App.tsx", app], ["Chat.tsx", chat]] as const) {
    for (const line of src.split("\n").filter((l) => /held/i.test(l))) {
      assert.doesNotMatch(line, /indexedDB|localStorage|sessionStorage/, `${name}: ${line}`);
    }
  }
});
