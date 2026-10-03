// A page of the old circle never lands in the new one (D2, panel 2026-10-03):
// the feed of radius 100 is held back by the route and answered late with a
// card of its own; by then the person has moved to 1000, and the late answer
// must be dropped, not drawn over the new circle's cards.

import { expect, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

test("a feed page asked before the radius changed is not drawn", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);
  await writePhrase(page, `в парке ${runLabel()}`);
  await expect(page.getByTestId("card").first()).toBeVisible({ timeout: 30000 });

  const stale = `старый круг ${runLabel()}`;
  let held = 0;
  await page.route(/\/feed\?.*radius=100(&|$)/, async (route) => {
    held += 1;
    const answer = await route.fetch();
    const body = await answer.json();
    if (body.items?.[0]) body.items = [{ ...body.items[0], id: `stale-${held}`, text: stale }, ...body.items];
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({ response: answer, body: JSON.stringify(body) });
  });

  await page.getByTestId("radius").selectOption("100");
  await expect.poll(() => held, { timeout: 10000 }).toBeGreaterThan(0);
  await page.getByTestId("radius").selectOption("1000");
  // The held answer comes back in 3 s; wait past it and look.
  await page.waitForTimeout(5000);
  await expect(page.getByTestId("card").first()).toBeVisible();
  await expect(page.getByTestId("card").filter({ hasText: stale }), "a card of the old circle was drawn in the new one").toHaveCount(0);
});
