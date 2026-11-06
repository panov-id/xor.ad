// The tablet's talk is archive screen 113 beside its rail (owner 03.11.2026: «шаг 5 как в архиве»). Source reading, as the app's other shell tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gen = readFileSync(new URL("../nd4/chat-tablet.gen.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../screens/Chat.tsx", import.meta.url), "utf8");

test("chat-tablet: generated from screen 113, its handles wired, the sample words gone", () => {
  assert.match(gen, /^\/\/ generated from .*kypros-tablet\.html screen 113/);
  for (const id of ["chat-back", "chat-more", "chat-ring", "starter-chip"]) assert.ok(gen.includes(`data-testid="${id}"`), `no ${id}`);
  for (const slot of ["{p.lines}", "{p.foot}", "{p.who}", "{p.line}"]) assert.ok(gen.includes(slot), `no ${slot}`);
  for (const sample of ["Eleni", "350 m", "fades in", "Dasoudi", "See you at 7", ">Message<"]) assert.ok(!gen.includes(sample), `sample left: ${sample}`);
});

test("chat-tablet: Chat draws it with the rail at the tablet, with the same live lines and foot", () => {
  const branch = chat.slice(chat.indexOf('frame === "screen" && drawing === "tablet"'), chat.indexOf("<Frame hidden"));
  assert.ok(branch.includes('<RailTablet active="chats" />'), "the rail is gone from the tablet's talk");
  assert.ok(branch.includes("<ChatScreenTablet"), "the archive's screen is gone");
  assert.match(branch, /lines=\{over \? ended : lines\}/);
  assert.match(branch, /foot=\{over \? undefined : foot\}/);
  assert.ok(branch.includes("{overlay}"), "the menu and the safety code have no layer");
});

test("the tablet's talk follows screen 113: lines sit on the foot, no clock, chips share the width", () => {
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const scope = '[data-screen="chat"][data-width="tablet"]';
  for (const rule of [".k-ch-list > :first-child { margin-top: auto; }", ".k-ch-time { display: none; }", ".k-ch-chip { flex: 1;", ".k-ch-theirs .k-ch-bubble { background: var(--kit-d-5521ec);"])
    assert.ok(wide.includes(`${scope} ${rule}`), `wide.css lost: ${rule}`);
});
