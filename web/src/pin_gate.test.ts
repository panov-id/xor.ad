// The PIN gate's rules (depth/core/pin_gate.ts), shared with the app shell: what the node's refusal means, when the
// last attempts are said, the lock's "too soon" clock. The web's Unlock, Locked and pinWords call them, so a break
// here is a break on screen 12. scripts/run-web-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canOpen, clockText, isLastAttempts, LAST_ATTEMPTS, pinRefusal, secondsLeft, untilOf } from "../../depth/core/pin_gate.ts";

test("a miss names the attempts left; the last three say what the tenth does", () => {
  assert.deepEqual(pinRefusal({ code: "pin_mismatch", attemptsLeft: 7 }), { kind: "mismatch", left: 7, last: false });
  assert.deepEqual(pinRefusal({ code: "pin_mismatch", attemptsLeft: 4 }), { kind: "mismatch", left: 4, last: false });
  assert.deepEqual(pinRefusal({ code: "pin_mismatch", attemptsLeft: 3 }), { kind: "mismatch", left: 3, last: true });
  assert.deepEqual(pinRefusal({ code: "pin_mismatch", attemptsLeft: 1 }), { kind: "mismatch", left: 1, last: true });
  assert.deepEqual(pinRefusal({ code: "pin_mismatch" }), { kind: "mismatch", left: undefined, last: false });
  assert.equal(LAST_ATTEMPTS, 3);
  assert.equal(isLastAttempts(0), true);
  assert.equal(isLastAttempts(undefined), false);
});
test("the lock: the tenth miss, a frozen session (401 / unauthorized) close entry until the paper code", () => {
  assert.equal(pinRefusal({ code: "pin_locked" }).kind, "locked");
  assert.equal(pinRefusal({ code: "unauthorized" }).kind, "locked");
  assert.equal(pinRefusal({ code: "status_401" }).kind, "locked");
  assert.equal(pinRefusal({ status: 401 }).kind, "locked");
});
test("too soon: the PIN was not checked, the seconds are the node's", () => {
  assert.deepEqual(pinRefusal({ code: "rate_limited", retryAfter: 12 }), { kind: "wait", seconds: 12 });
  assert.deepEqual(pinRefusal({ code: "rate_limited" }), { kind: "wait", seconds: undefined });
});
test("anything else is not named", () => {
  assert.deepEqual(pinRefusal({ code: "status_500", status: 500 }), { kind: "other", code: "status_500", status: 500 });
});
test("open goes with six digits, nothing in flight and entry not closed", () => {
  assert.equal(canOpen("123456", false), true);
  assert.equal(canOpen("12345", false), false);
  assert.equal(canOpen("1234567", false), false);
  assert.equal(canOpen("12345a", false), false);
  assert.equal(canOpen("123456", true), false);
  assert.equal(canOpen("123456", false, true), false);
});
test("the wait's clock: ends at the node's seconds, counts whole seconds up, reads mm:ss", () => {
  assert.equal(untilOf(1000, 30), 31000);
  assert.equal(untilOf(1000, undefined), null);
  assert.equal(secondsLeft(31000, 1000), 30);
  assert.equal(secondsLeft(31000, 1001), 30); // 29.999 s left reads 30
  assert.equal(secondsLeft(31000, 30500), 1);
  assert.equal(secondsLeft(31000, 31000), 0);
  assert.equal(secondsLeft(31000, 99999), 0);
  assert.equal(secondsLeft(null, 5), 0);
  assert.equal(clockText(0), "00:00");
  assert.equal(clockText(75), "01:15");
});
