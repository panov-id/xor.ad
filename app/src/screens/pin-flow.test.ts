// The PIN in two screens (pin-flow.ts; NEWDESIGN_PLAN §7 step 5): the sixth digit moves on, a repeat that differs
// starts over and says so, the pad appends and erases. node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { afterDigits, MISSES_BACK, PAIRS, pickPair, pressed } from "./pin-flow.ts";

test("the PIN's sixth digit opens the repeat; fewer stay", () => {
  assert.equal(afterDigits({ stage: "pin", pin: "48391", again: "", mismatch: false }).stage, "pin");
  const m = afterDigits({ stage: "pin", pin: "483915", again: "", mismatch: false });
  assert.equal(m.stage, "again"); assert.equal(m.create, false);
});

test("the repeat that matches creates; one that differs is cleared and says so; the third miss goes back to the PIN (SCREENS_spec §4)", () => {
  assert.equal(afterDigits({ stage: "again", pin: "483915", again: "48391", mismatch: false }).create, false);
  assert.equal(afterDigits({ stage: "again", pin: "483915", again: "483915", mismatch: false }).create, true);
  const once = afterDigits({ stage: "again", pin: "483915", again: "483916", mismatch: false });
  assert.deepEqual(once, { stage: "again", pin: "483915", again: "", mismatch: true, misses: 1, create: false }, "a differing repeat was let through");
  const twice = afterDigits({ ...once, again: "111111" });
  assert.equal(twice.stage, "again"); assert.equal(twice.misses, 2);
  const third = afterDigits({ ...twice, again: "222222" });
  assert.deepEqual(third, { stage: "pin", pin: "", again: "", mismatch: true, misses: 0, create: false }, `${MISSES_BACK} misses did not go back`);
  assert.equal(afterDigits({ stage: "pin", pin: "483915", again: "", mismatch: true, misses: 2 }).misses, 0, "a new PIN keeps the old misses");
});

test("the paper check asks two of the four groups: 6 pairs, never the last one again", () => {
  assert.equal(new Set(PAIRS.map((p) => p.join())).size, 6);
  for (const p of PAIRS) assert.ok(p[0] < p[1] && p[0] >= 0 && p[1] <= 3, `pair ${p}`);
  const seen = new Set<string>();
  for (let k = 0; k < 6; k++) for (const last of PAIRS) {
    const next = pickPair(last, () => k / 6);
    assert.notDeepEqual(next, last, `pair ${last} asked twice`);
    seen.add(next.join());
  }
  assert.equal(seen.size, 6, `${seen.size} of 6 pairs ever asked`);
  assert.ok(PAIRS.some((p) => p.join() === pickPair(null, () => 0.99).join()));
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
  assert.match(l, /<PinDoor screen="locked"/, "the lock screen is not the PIN door of 06");
  assert.match(readFileSync(new URL("./pin-door.tsx", import.meta.url), "utf8"), /<PinPad /);
  assert.doesNotMatch(l, /data-testid="lock-go"/);
});

// docs/newdesign4 06–09 (SCREENS_spec §7–10), read from the screens' source.
test("the PIN door 06–09: the pad's paper key, the ring and shake for a second, tries from the node, «⋯» to forget, forget outlined", () => {
  const door = readFileSync(new URL("./pin-door.tsx", import.meta.url), "utf8");
  const u = readFileSync(new URL("./Unlock.tsx", import.meta.url), "utf8");
  const l = readFileSync(new URL("./Locked.tsx", import.meta.url), "utf8");
  const parts = readFileSync(new URL("./register-parts.tsx", import.meta.url), "utf8");
  assert.match(parts, /paper \? <button key="paper"[^\n]*aria-label=\{say\("app\.unlock\.paper"\)\}[^\n]*data-testid="unlock-restore"/, "the pad has no paper code key");
  assert.match(u, /onPaper=\{onRestore\}/, "the unlock pad's paper key leads nowhere");
  assert.match(parts, /k === "back" \? <span className="nd-erase" aria-hidden="true">⌫<\/span>/, "the erase key is not the mockup's ⌫");
  assert.match(door, /setRing\(true\)[\s\S]{0,140}setTimeout\(\(\) => setRing\(false\), 1000\)/, "the refused dots do not ring for a second");
  assert.match(u, /say\("app\.unlock\.wrong", \{ n: refusal\.left \}\)/, "the refusal does not say the tries left");
  assert.match(u, /refusals >= 3 && <p[^\n]*data-testid="unlock-forgot"/, "«Forgot it?» does not come after the third miss");
  assert.match(u, /onClick=\{\(\) => setSure\(true\)\} data-testid="forget"/, "«⋯» does not open forget");
  assert.match(u, /className="nd-danger" onClick=\{onForget\} data-testid="forget-sure"/, "«Forget» is not outlined");
  assert.match(l, /say\("app\.locked\.away", \{ n: Math\.max\(1, Math\.round\(idleMs\(\) \/ 60_000\)\) \}\)/, "the lock line does not say this build's own minutes");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  const keys = [...new Set([...u, ...l].length ? [...(u + l + door).matchAll(/say\("(app\.(?:unlock|locked|forget)\.[a-z0-9_]+)"/g)].map((m) => m[1]) : [])];
  assert.ok(keys.length >= 15, `only ${keys.length} keys`);
  for (const key of keys) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
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

// docs/newdesign4 screens 02–05a (SCREENS_spec §2–5а), read from the screen's source.
test("register 02–05a: back and three step dots, the eye on the PIN pad, back on 2b starts the PIN over, the code 2×2 and two groups asked", () => {
  const reg = readFileSync(new URL("./Register.tsx", import.meta.url), "utf8");
  const parts = readFileSync(new URL("./register-parts.tsx", import.meta.url), "utf8");
  for (const id of ["register-1", "register-2", "register-2b", "register-3", "register-3-check"]) assert.match(reg, new RegExp(`"${id}"`), `no screen ${id}`);
  assert.match(reg, /stage === "again" \? restartPin/, "«back» on 2b does not start the PIN over");
  assert.match(reg, /const restartPin = \(\) => \{ setPin\(""\); setPinAgain\(""\); setMismatch\(false\); setMisses\(0\); setStage\("pin"\); \}/, "starting over keeps a PIN");
  assert.match(reg, /\[1, 2, 3\]\.map\(\(n\) => <i key=\{n\} data-done=\{n <= step/, "the step dots are not three");
  assert.match(reg, /<PinPad [^>]*shown=\{shown\} onEye=/, "the PIN pad has no «show digits»");
  assert.match(reg, /secret=\{!shown\}/, "«show digits» does not show the digits");
  assert.match(reg, /visibilitychange[\s\S]{0,120}setShown\(false\)|setShown\(false\)[\s\S]{0,160}visibilitychange/, "«show digits» stays on when the app is hidden");
  assert.match(parts, /aria-pressed=\{!!shown\}[\s\S]{0,200}data-testid="pad-eye"/, "the eye key has no aria-pressed");
  assert.match(reg, /readPaperText\(first\) !== groups\[pair\[0\]\] \|\| readPaperText\(second\) !== groups\[pair\[1\]\]/, "the check does not read the asked pair");
  assert.match(reg, /setPair\(\(p\) => pickPair\(p\)\)/, "«Show the code again» keeps the same pair");
  assert.match(parts, /className="nd-code-tile" data-group=\{i \+ 1\}/, "the paper code is not four numbered tiles");
  assert.doesNotMatch(reg, /navigator\.clipboard/, "the paper code step touches the clipboard");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  const keys = [...new Set([...reg.matchAll(/say\("(app\.reg\.[a-z0-9_]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 25, `only ${keys.length} app.reg keys`);
  for (const key of keys) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});
