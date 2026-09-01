// What the moderator reads when there is no copy.
//
// The screen showed all six situations as "never held" for as long as the column
// existed, and the modal argued "either… or" in prose while the row it was
// rendering held the answer. Neither was a crash and neither was visible: the
// queue looked fine, and a broken lookup sat next to a rule of the product
// wearing the same words.
//
// So what is pinned here is not the wording but the distinctions: a copy that
// exists, a copy that expired, six reasons it was never held, a reason the screen
// has not met, and a notice too old to carry one.

import { describe, expect, it } from "vitest";
import {
  COPY_LABEL,
  NO_REASON_RECORDED,
  REASON_LONG,
  REASON_SHORT,
  copyCell,
  longReason,
} from "./reasons";

// The list the node's CHECK allows (relay/node/db/014). A gate keeps the maps
// equal to the migration file itself; this keeps the behaviour equal to the list.
const REASONS = [
  "chat_not_stored",
  "unknown_kind",
  "surface_absent",
  "unattributed",
  "out_of_scope",
  "lookup_failed",
];

describe("the Copy cell", () => {
  it("says yes when a copy exists, whatever the state says", () => {
    expect(copyCell(true, "not_accessible", "lookup_failed")).toBe("yes");
  });

  it("names the state when the content went before we looked", () => {
    expect(copyCell(false, "target_gone", null)).toBe(COPY_LABEL.target_gone);
  });

  it("adds the reason to «never held», one wording per situation", () => {
    const rendered = REASONS.map((reason) => copyCell(false, "not_accessible", reason));
    for (const line of rendered) {
      expect(line.startsWith("never held · ")).toBe(true);
    }
    // Six distinct cells: the whole point is that they stop looking alike.
    expect(new Set(rendered).size).toBe(REASONS.length);
  });

  it("shows an unknown reason as itself rather than hiding it", () => {
    expect(copyCell(false, "not_accessible", "seventh_reason")).toBe(
      "never held · seventh_reason",
    );
  });

  it("falls back to the bare state on a notice with no reason recorded", () => {
    expect(copyCell(false, "not_accessible", null)).toBe("never held");
  });

  it("does not invent a label for a state it has never met", () => {
    expect(copyCell(false, "something_new", null)).toBe("—");
  });
});

describe("the modal's paragraph", () => {
  it("has a wording for every reason the database allows", () => {
    for (const reason of REASONS) {
      expect(REASON_LONG, `${reason} has no long wording`).toHaveProperty(reason);
      expect(REASON_SHORT, `${reason} has no short wording`).toHaveProperty(reason);
    }
  });

  it("stops guessing: every wording is distinct and none offers two options", () => {
    const texts = REASONS.map((reason) => longReason(reason));
    expect(new Set(texts).size).toBe(REASONS.length);
    for (const text of texts) {
      // The shape being banned is "either X or Y", not the word: "either way"
      // is an idiom and says nothing uncertain. The first version of this line
      // matched the bare word and failed on the lookup_failed wording, which is
      // the most certain of the six.
      expect(text.toLowerCase()).not.toMatch(/either\b[^.]*\bor\b/);
    }
  });

  it("says plainly when the notice predates the column", () => {
    expect(longReason(null)).toBe(NO_REASON_RECORDED);
    // This one may say "either" — not knowing is the honest answer here, and
    // sounding certain would be the defect rather than the fix.
    expect(NO_REASON_RECORDED.toLowerCase()).toContain("either");
  });

  it("names an unmet reason instead of going quiet", () => {
    expect(longReason("seventh_reason")).toContain("seventh_reason");
  });

  it("keeps the other face unnamed when the target is out of scope", () => {
    // The node deliberately tells the reporter only that it was not found under
    // this face (lib/dsa_snapshot.ts). The panel must not undo that in its own
    // wording, since the moderator copies from it into the answer.
    expect(longReason("out_of_scope")).not.toMatch(/sosed|neighbro|another face is/i);
  });
});
