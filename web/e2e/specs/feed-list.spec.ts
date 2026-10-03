// Panel 03.10.2026, P8 and P7, against a live node in a browser.
// P8: the feed is a list of items — no card is <li role="button">; what is
// pressed is a real button inside the item, named by the phrase, and Enter on
// it opens the card. axe's list rules stay clean with cards on screen.
// P7 (sosed only): under prefers-reduced-motion the full-screen card has no
// transition, so a swipe short of the threshold jumps back instead of sliding.

import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

test("feed cards are list items with a named button inside; reduced motion stops the sosed card's slide", async ({ browser }) => {
  test.setTimeout(150_000);
  const label = runLabel();
  const line = `список ${label}`;
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    await writePhrase(a, line);

    const b = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
    contexts.push(b.context());
    await register(b, { name: "Борис", age: "31" });
    await b.getByTestId("nav-inbox").click();
    await b.getByTestId("nav-feed").click();
    const card = b.getByTestId("card").filter({ hasText: line });
    await expect(card, `the phrase «${line}» is in B's feed`).toHaveCount(1, { timeout: 30000 });

    const roles = await b.getByTestId("cards").evaluate((ul) => [...ul.children].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute("role") ? `[role=${c.getAttribute("role")}]` : ""}`));
    expect.soft(roles.filter((r) => r !== "li"), "P8: every child of the feed list is a plain <li>, not a button").toEqual([]);
    const open = card.getByRole("button", { name: line });
    await expect(open, "P8: the card's button is named by its phrase").toHaveCount(1);

    const axe = await new AxeBuilder({ page: b }).include('[data-testid="cards"]').withRules(["list", "listitem", "nested-interactive", "button-name"]).analyze();
    expect.soft(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`), "P8: axe on the feed list").toEqual([]);

    const id = (await card.getAttribute("data-id"))!;
    await open.focus();
    await b.keyboard.press("Enter");
    await expect(b.locator('[data-screen="card"]'), "P8: Enter on the card's button opens it").toHaveAttribute("data-id", id);

    if ((await b.locator("html").getAttribute("data-brand")) === "sosed") {
      const transition = await b.getByTestId("swipe-card").evaluate((el) => getComputedStyle(el).transitionDuration);
      expect.soft(transition.split(",").every((t) => parseFloat(t) === 0), `P7: reduced motion leaves the sosed card without a transition, got ${transition}`).toBe(true);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
