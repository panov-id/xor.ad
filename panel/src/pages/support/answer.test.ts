// The counter the answer field shows is the node's count: graphemes, after the
// trim — support.answer.length (4000). Tested from both sides of the boundary.

import { describe, expect, it } from "vitest";
import { ANSWER_MAX, answerLength } from "./list";

describe("the answer counter", () => {
  it("counts graphemes after the trim, as the node does", () => {
    expect(answerLength("  ок  ")).toBe(2);
    expect(answerLength("👨‍👩‍👧")).toBe(1);
  });
  it("the limit is the registry's 4000", () => {
    expect(ANSWER_MAX).toBe(4000);
    expect(answerLength("а".repeat(4000)) <= ANSWER_MAX).toBe(true);
    expect(answerLength("а".repeat(4001)) <= ANSWER_MAX).toBe(false);
  });
});
