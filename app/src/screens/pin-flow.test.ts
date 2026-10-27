// The PIN in two screens (pin-flow.ts; NEWDESIGN_PLAN §7 step 5): the sixth digit moves on, a repeat that differs
// starts over and says so, the pad appends and erases. node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { afterDigits, pressed } from "./pin-flow.ts";

test("the PIN's sixth digit opens the repeat; fewer stay", () => {
  assert.equal(afterDigits({ stage: "pin", pin: "48391", again: "", mismatch: false }).stage, "pin");
  const m = afterDigits({ stage: "pin", pin: "483915", again: "", mismatch: false });
  assert.equal(m.stage, "again"); assert.equal(m.create, false);
});

test("the repeat that matches creates; one that differs goes back, both cleared, and says so", () => {
  assert.equal(afterDigits({ stage: "again", pin: "483915", again: "48391", mismatch: false }).create, false);
  assert.equal(afterDigits({ stage: "again", pin: "483915", again: "483915", mismatch: false }).create, true);
  const back = afterDigits({ stage: "again", pin: "483915", again: "483916", mismatch: false });
  assert.deepEqual(back, { stage: "pin", pin: "", again: "", mismatch: true, create: false }, "a differing repeat was let through");
});

test("the pad appends a digit up to six and «back» takes one off", () => {
  assert.equal(pressed("", "4"), "4");
  assert.equal(pressed("123456", "7"), "123456", "a seventh digit was taken");
  assert.equal(pressed("123", "back"), "12");
  assert.equal(pressed("", "back"), "");
  assert.equal(pressed("12", "x"), "12");
});

test("the screen names the repeat register-2b and the pad has 11 keys (0–9 and back)", () => {
  const reg = readFileSync(new URL("./Register.tsx", import.meta.url), "utf8");
  assert.match(reg, /"register-2b"/, "the repeat is no screen of its own");
  const parts = readFileSync(new URL("./register-parts.tsx", import.meta.url), "utf8");
  const keys = /const keys = (\[[^\]]+\])/.exec(parts)?.[1] ?? "[]";
  assert.deepEqual(JSON.parse(keys).filter((k: string) => k).sort(), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "back"]);
});

test("the PIN screen asks on the sixth digit, has no «enter» button, and «forget» is a screen of its own", () => {
  const u = readFileSync(new URL("./Unlock.tsx", import.meta.url), "utf8");
  assert.match(u, /pin\.length === PIN_LENGTH && !busy && !closed\) void unlock\(\)/, "the sixth digit does not ask the node");
  assert.doesNotMatch(u, /data-testid="unlock"/, "the «enter» button is back");
  assert.match(u, /if \(sure\) return <ForgetConfirm/, "«forget» is a second tap again, not its own screen");
  assert.match(u, /data-screen="forget-confirm"/, "the forget screen lost its name");
});

test("the lock screen asks on the sixth digit too and has the pad", () => {
  const l = readFileSync(new URL("./Locked.tsx", import.meta.url), "utf8");
  assert.match(l, /pin\.length === PIN_LENGTH && !busy\) void open\(\)/, "the lock screen waits for a button again");
  assert.match(l, /<PinPad /);
  assert.doesNotMatch(l, /data-testid="lock-go"/);
});

test("«how it works»: four cards, each with its icon and words in ru and en, the last leads to the place", async () => {
  const intro = readFileSync(new URL("./Intro.tsx", import.meta.url), "utf8");
  const keys = [...intro.matchAll(/key: "([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["say", "both", "tables", "safe"]);
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const k of keys) for (const part of ["title", "text"]) {
    assert.equal((i18n.match(new RegExp(`"app\\.intro\\.${k}_${part}"`, "g")) ?? []).length, 2, `app.intro.${k}_${part} is not in both ru and en`);
  }
  const icons = readFileSync(new URL("../shell/nd-icons.gen.ts", import.meta.url), "utf8");
  for (const m of intro.matchAll(/icon: "([a-z-]+)"/g)) assert.ok(icons.includes(`"${m[1]}":{`), `no icon ${m[1]}`);
});

test("a phrase's size by its length in graphemes: 40 large, 100 middle, longer small (NEWDESIGN_PLAN §5)", async () => {
  const { textSize } = await import("./feed-logic.ts");
  const rows: [string, string][] = [["", "l"], ["a".repeat(40), "l"], ["a".repeat(41), "m"], ["a".repeat(100), "m"], ["a".repeat(101), "s"], ["a".repeat(280), "s"],
    ["ა".repeat(40), "l"], ["👨‍👩‍👧".repeat(40), "l"], ["👨‍👩‍👧".repeat(41), "m"]];
  for (const [t, want] of rows) assert.equal(textSize(t), want, `${[...t].length} code points`);
});

test("register: a node refusal with both PINs typed offers «try again»; forget runs once; the PIN leaves on success (panel 26.10 #2-4)", () => {
  const r = readFileSync(new URL("./Register.tsx", import.meta.url), "utf8");
  assert.match(r, /error && !busy && stage === "again" && pinAgain\.length === PIN_CELLS[\s\S]{0,120}register\(\)[\s\S]{0,80}data-testid="register-retry"/, "no «try again» after a refusal");
  const u = readFileSync(new URL("./Unlock.tsx", import.meta.url), "utf8");
  assert.match(u, /if \(forgetting\.current\) return; forgetting\.current = true;/, "«wipe it» can run twice");
  assert.match(u, /if \(r\.ok\) \{ setPin\(""\);/, "the PIN stays on the screen after it opened");
});

test("an icon the prototype draws is drawn in its shape (proto-icons.gen.ts), N of N", async () => {
  const { PROTO_ICONS } = await import("../shell/proto-icons.gen.ts");
  const names = Object.keys(PROTO_ICONS);
  assert.ok(names.length >= 91, `only ${names.length} icons`);
  const icon = readFileSync(new URL("../shell/NdIcon.tsx", import.meta.url), "utf8");
  assert.match(icon, /const proto = PROTO_ICONS\[name\];\s*if \(proto !== undefined\)/, "NdIcon does not take the prototype's shape first");
  assert.match(PROTO_ICONS.write, /M24 15V27M18 21H30/, "«write» is not the prototype's bubble with a plus");
});
