// Who the statement of reasons is addressed to, and who says so (P8, 2026-09-26).
//
// For a phrase of the feed the node resolves the author from the row; the form
// must not ask for — nor send — an addressee typed by hand, or the statement
// lands on a typo and never reaches GET /statements. For every other kind the
// operator names it, as before.
import { describe, expect, it } from "vitest";
import { needsRecipient } from "./list";

describe("needsRecipient", () => {
  it("does not ask for an addressee on a phrase of the feed: the node knows its author", () => {
    expect(needsRecipient("feed_message")).toBe(false);
  });
  it("asks for one on everything else", () => {
    for (const kind of ["offer", "chat", "table_line", "other"]) expect(needsRecipient(kind)).toBe(true);
  });
});
