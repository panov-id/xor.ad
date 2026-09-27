// What I hid and whom I blocked, and the way back (L1; chat spec §8.9;
// depth/ink rooms.ts): B hides A's phrase, finds it under "скрытое" in "me",
// brings it back and sees it in the feed again; then blocks A by the same
// phrase, finds "Заблокировано: 1", lifts it, and the row goes away. Every
// step is read back from the node's answers too.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

test("a hidden phrase comes back from 'hidden', a block is lifted from 'blocked'", async ({ browser }) => {
  test.setTimeout(150_000);
  const phrase = `кто на рынок к десяти? ${Date.now().toString(36)}`;
  const a = await (await browser.newContext()).newPage();
  await register(a);
  await a.getByTestId("write").click();
  await a.getByTestId("text").fill(phrase);
  await a.getByTestId("send").click();
  await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });

  const b = await (await browser.newContext()).newPage();
  const answers: Array<[string, string, number]> = [];
  b.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/(hidden|blocks)(\/|$)/.test(path)) answers.push([r.request().method(), path.split("/")[1], r.status()]);
  });
  await register(b, { name: "Борис", age: "31" });
  await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });

  // Hide from the card; the phrase is in "скрытое · 1".
  await b.getByTestId("card").filter({ hasText: phrase }).click();
  await b.getByTestId("hide").click();
  await expect(b.getByTestId("card").filter({ hasText: phrase })).toHaveCount(0);
  await b.getByTestId("tab-me").click();
  await expect(b.getByTestId("me-hidden")).toHaveText("скрытое · 1", { timeout: 15000 });
  await expect(b.getByTestId("me-blocked")).toHaveCount(0);
  await b.getByTestId("me-hidden").click();
  await expect(b.getByTestId("hidden-row")).toHaveCount(1, { timeout: 15000 });
  await expect(b.getByTestId("hidden-row")).toContainText(phrase);
  await b.getByTestId("hidden-restore").click();
  await expect(b.getByTestId("hidden-empty")).toHaveText("ничего не скрыто", { timeout: 15000 });
  await b.getByTestId("back").click();
  await expect(b.getByTestId("me-hidden")).toHaveText("скрытое · 0", { timeout: 15000 });
  await b.getByTestId("nav-feed").click();
  await expect(b.getByTestId("card").filter({ hasText: phrase })).toHaveCount(1, { timeout: 15000 });

  // Block by the same phrase; "Заблокировано: 1" appears, and is lifted.
  await b.getByTestId("card").filter({ hasText: phrase }).click();
  await b.getByTestId("block").click();
  await b.getByTestId("block-confirm-yes").click();
  await expect(b.getByTestId("card").filter({ hasText: phrase })).toHaveCount(0, { timeout: 15000 });
  await b.getByTestId("tab-me").click();
  await expect(b.getByTestId("me-blocked")).toHaveText("Заблокировано: 1", { timeout: 15000 });
  await b.getByTestId("me-blocked").click();
  await expect(b.getByTestId("blocked-row")).toHaveCount(1, { timeout: 15000 });
  await expect(b.getByTestId("blocked-row")).toContainText("блокировка от ");
  await b.getByTestId("blocked-lift").click();
  await expect(b.locator('[data-screen="blocked"]')).toHaveAttribute("data-count", "0", { timeout: 15000 });
  await b.getByTestId("back").click();
  await expect(b.getByTestId("me-blocked")).toHaveCount(0, { timeout: 15000 });

  expect(answers.filter(([m]) => m === "DELETE").map(([, what, s]) => [what, s])).toEqual([["hidden", 204], ["blocks", 204]]);
});
