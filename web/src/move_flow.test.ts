// The move's screen rules (depth/core/move_flow.ts), shared by the app shell, the web and the terminal: what ends
// a move, what a refused claim says, when a typed code is whole, the code's life, "when", the pace guard, the
// browser's name for itself, the step away's clock. scripts/run-web-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
// Same file as app/src/screens/move_flow.test.ts: the faces call the SDK's rules, and both are red when one breaks.
import {
  arrivalAsking, awayClock, claimRefusal, departureAsking, departureStep, deviceLabel, endingOf, initialOf, MOVE_ENDINGS, newPinReady, oneAtATime,
  secondsLeft, seenWords, typedCode,
} from "../../depth/core/move_flow.ts";

test("every way a move ends says so, and an open move has no ending", () => {
  assert.deepEqual(MOVE_ENDINGS, { rejected: "move.rejected", cancelled: "move.twice", expired: "move.expired", garbled: "move.garbled" });
  assert.equal(endingOf("waiting"), null);
  assert.equal(endingOf("claimed"), null);
  assert.equal(endingOf("approved"), null);
  assert.equal(endingOf("cancelled"), "move.twice");
});

test("a refused claim: 404 and 409 in their words, 429 in the claim's own with the node's wait, others have none", () => {
  assert.deepEqual(claimRefusal({ status: 404 }), { key: "move.codeBad" });
  assert.deepEqual(claimRefusal({ status: 409 }), { key: "move.twice" });
  assert.deepEqual(claimRefusal({ status: 429, retryAfter: 42 }), { key: "restore.wait", values: { n: "42" } });
  assert.deepEqual(claimRefusal({ status: 429 }), { key: "restore.wait", values: { n: "?" } });
  assert.equal(claimRefusal({ status: 503 }), null);
});

test("a typed code is read as the paper is (case, dashes, spaces) and is whole at nine", () => {
  assert.deepEqual(typedCode("h7k-2mq 9xd"), { clean: "H7K2MQ9XD", complete: true });
  assert.equal(typedCode("H7K2MQ").complete, false);
  assert.equal(typedCode("").clean, "");
});

test("the code's life: whole seconds, never below zero", () => {
  assert.equal(secondsLeft(120_000, 8_400), 112);
  assert.equal(secondsLeft(1_000, 5_000), 0);
});

test("when: under ten seconds is just now, then the seconds", () => {
  assert.deepEqual(seenWords(0, 9_400), { key: "move.justNow" });
  assert.deepEqual(seenWords(0, 12_000), { key: "move.secondsAgo", values: { n: 12 } });
  assert.deepEqual(seenWords(5_000, 0), { key: "move.justNow" });
});

test("the old device kills a garbled claim, is moved on approved, asks while waiting or claimed", () => {
  assert.deepEqual(departureStep("garbled"), { kill: true, moved: false });
  assert.deepEqual(departureStep("approved"), { kill: false, moved: true });
  assert.deepEqual(departureStep("claimed"), { kill: false, moved: false });
  assert.equal(departureAsking("waiting"), true);
  assert.equal(departureAsking("claimed"), true);
  assert.equal(departureAsking("approved"), false);
  assert.equal(arrivalAsking("claimed"), true);
  assert.equal(arrivalAsking("waiting"), false);
});

test("the new PIN: six digits, the same twice", () => {
  assert.equal(newPinReady("483915", "483915"), true);
  assert.equal(newPinReady("483915", "483916"), false);
  assert.equal(newPinReady("48391", "48391"), false);
  assert.equal(newPinReady("48391a", "48391a"), false);
});

test("one ask at a time: a tick while the last is out skips; a tick with nothing to ask does not block", async () => {
  let asked = 0;
  let finish: () => void = () => undefined;
  const tick = oneAtATime(() => { asked++; return new Promise<void>((done) => { finish = done; }); });
  tick(); tick(); tick();
  assert.equal(asked, 1);
  finish();
  await new Promise((r) => setTimeout(r, 0));
  tick();
  assert.equal(asked, 2);
  let none = 0;
  const idle = oneAtATime(() => { none++; return undefined; });
  idle(); idle();
  assert.equal(none, 2);
  // a failed ask frees the guard too
  let failed = 0;
  const failing = oneAtATime(() => { failed++; return Promise.reject(new Error("no")); });
  failing();
  await new Promise((r) => setTimeout(r, 0));
  failing();
  assert.equal(failed, 2);
});

test("a browser names itself by its user agent", () => {
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  assert.equal(deviceLabel(android, "browser"), "Chrome, Android");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0", "browser"), "Firefox, Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "browser"), "Safari, iOS");
  assert.equal(deviceLabel("curl/8", "браузер"), "браузер");
  assert.equal(initialOf("chrome, Android"), "C");
  assert.equal(initialOf("  "), "?");
});

test("the step away's clock: HH:MM, whole minutes left (one at least), over at the end", () => {
  const until = Math.floor(new Date(2026, 9, 18, 15, 40).getTime() / 1000);
  assert.deepEqual(awayClock(until, until - 125), { time: "15:40", minutes: 3, over: false });
  assert.deepEqual(awayClock(until, until - 5), { time: "15:40", minutes: 1, over: false });
  assert.equal(awayClock(until, until).over, true);
});
