import { describe, expect, it } from "vitest";
import { monthsBack, recipientsText } from "./recipients";

describe("dsa recipients", () => {
  it("shows the six months before this one, a month with no row as not counted", () => {
    const rows = monthsBack([{ month: "2026-09", active: 10 }, { month: "2026-07", active: 7 }], new Date(Date.UTC(2026, 9, 5)));
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04"]);
    expect(rows.map((r) => r.active)).toEqual([10, null, 7, null, null, null]);
  });

  it("crosses a year back", () => {
    expect(monthsBack([], new Date(Date.UTC(2026, 1, 1)))[1].month).toBe("2025-12");
  });

  it("copies the figure with its method, and the mark while fewer than six months are counted", () => {
    const method = "identities that finished signing up with a session seen in the month; all counted as in the Union";
    const months = [{ month: "2026-09", active: 1 }, { month: "2026-08", active: 3 }];
    expect(recipientsText({ months, average: 2, complete: false, method }))
      .toBe(`Average monthly active recipients, DSA Art. 24(3): 2 (incomplete: 2 of 6 months counted). Method: ${method}.`);
    expect(recipientsText({ months, average: 2, complete: true, method })).not.toContain("incomplete");
  });
});
