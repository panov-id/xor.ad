import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { matchExit } from "./match-exit.ts";

test("match exit: a screen closed mid-exit moves nobody when the fallback fires", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const exit = matchExit(1500);
    let moved = 0;
    exit.leave(() => moved++);
    exit.dispose();
    mock.timers.tick(2000);
    assert.equal(moved, 0, "the fallback timer moved the person after the match screen was closed");
  } finally { mock.timers.reset(); }
});

test("match exit: the move runs once, on animation end or on the fallback", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const exit = matchExit(1500);
    let moved = 0;
    exit.leave(() => moved++);
    exit.left();
    mock.timers.tick(2000);
    assert.equal(moved, 1);
    exit.leave(() => moved++);
    exit.leave(() => moved++);
    mock.timers.tick(1500);
    assert.equal(moved, 2, "a re-armed exit must fire once, not per call");
  } finally { mock.timers.reset(); }
});
