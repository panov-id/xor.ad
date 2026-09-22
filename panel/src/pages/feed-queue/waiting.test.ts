// What the Waiting column says, and when it turns amber.
//
// moderation.queue.wait is ten minutes; a phrase that has waited eight is two
// minutes from being swept unread, and the column says so in colour. The
// boundary is tested from both sides so a later "> 480" does not pass unseen.

import { describe, expect, it } from "vitest";
import { AMBER_FROM_S, QUEUE_WAIT_S, isAlmostSwept, waitingLabel } from "./list";

describe("the waiting column", () => {
  it("prints minutes and zero-padded seconds", () => {
    expect(waitingLabel(0)).toBe("0 min 00 s");
    expect(waitingLabel(65)).toBe("1 min 05 s");
    expect(waitingLabel(520)).toBe("8 min 40 s");
  });

  it("turns amber at eight minutes of the ten, not before", () => {
    expect(AMBER_FROM_S).toBe(480);
    expect(QUEUE_WAIT_S).toBe(600);
    expect(isAlmostSwept(479)).toBe(false);
    expect(isAlmostSwept(480)).toBe(true);
  });
});
