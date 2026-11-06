// The «?» tour: its rules and its wiring into the talk (source reading, as the app's other shell tests).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { markTourSeen, nextStep, shouldAutoShow, tourKey, tourSeen } from "./tour-logic.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

test("tour: shows on first entry only, remembered per device", () => {
  const s = mem();
  assert.equal(tourSeen("chat", s), false);
  markTourSeen("chat", s);
  assert.equal(tourSeen("chat", s), true);
  assert.equal(s.getItem(tourKey("chat")), "1");
  assert.equal(tourSeen("tables", s), false);
});

test("tour: a storage that throws reads as seen and does not throw on write", () => {
  const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(tourSeen("chat", bad), true);
  assert.doesNotThrow(() => markTourSeen("chat", bad));
});

test("tour: no auto show under automation (navigator.webdriver) or once seen", () => {
  assert.equal(shouldAutoShow(false, true), false);
  assert.equal(shouldAutoShow(false, false), true);
  assert.equal(shouldAutoShow(false, undefined), true);
  assert.equal(shouldAutoShow(true, false), false);
});

test("tour: next walks the steps and the last one closes", () => {
  assert.equal(nextStep(0, 3), 1);
  assert.equal(nextStep(2, 3), null);
});

test("chat tour: «?» wired at every width, the auto show guarded, the texts in both languages", () => {
  const chat = read("../screens/Chat.tsx");
  assert.ok(chat.includes('data-testid="chat-help"'), "the phone/laptop bar has no chat-help");
  assert.ok(chat.includes("help={over ? undefined : openTour}"), "the tablet's «?» is not wired");
  assert.ok(chat.includes("shouldAutoShow(tourSeen(CHAT_TOUR), navigator.webdriver)"), "auto show is not guarded by webdriver");
  assert.ok(read("../nd4/chat-tablet.gen.tsx").includes('data-testid="chat-help"'), "the generated tablet head lost chat-help");
  const i18n = read("../i18n.ts");
  for (const k of ["step", "next", "skip", "close", "chat.1.title", "chat.1.text", "chat.2.title", "chat.2.text", "chat.3.title", "chat.3.text"])
    assert.equal(i18n.split(`"app.tour.${k}"`).length - 1, 2, `app.tour.${k} is not in ru and en`);
  assert.equal(i18n.split('"app.help.label"').length - 1, 2);
  for (const id of ["chat-ring", "chat-quick", "chat-more"]) assert.ok(chat.includes(`"${id}"`) || read("../nd4/chat-tablet.gen.tsx").includes(`"${id}"`), `target ${id} is gone`);
});

test("tour: focusable and calm with reduced motion", () => {
  const tour = read("./Tour.tsx");
  for (const w of ['role="dialog"', 'aria-modal="true"', "tabIndex={-1}", "card.current?.focus()", '"Escape"']) assert.ok(tour.includes(w), `Tour lost ${w}`);
  const css = read("../../tokens/layout.css");
  const at = css.indexOf("@keyframes k-tour-pop");
  assert.ok(css.slice(css.lastIndexOf("@media", at), at).includes("prefers-reduced-motion: no-preference"), "the pop runs under reduced motion");
});

test("each step takes the focus again: the card remounts per step, and Escape needs focus inside", () => {
  const tour = readFileSync(new URL("./Tour.tsx", import.meta.url), "utf8");
  assert.match(tour, /key=\{at\}/, "the card is no longer keyed by step: this test can go");
  assert.match(tour, /useEffect\(\(\) => \{ card\.current\?\.focus\(\); \}, \[at\]\)/, "Tour.tsx does not focus the card on a new step");
});
