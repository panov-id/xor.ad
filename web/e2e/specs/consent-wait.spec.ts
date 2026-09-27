// A match I agreed to still waits after a reload (W7; chat spec §8.5, P10):
// the node says my_consent "waiting" in the inbox row, and the screen shows
// the wait instead of offering "Поговорить" a second time.

import { expect, test } from "../fixtures/address.ts";
import { PIN, likeByCard, openMatch, register, unlock, writePhrase } from "./helpers.ts";

test("after a reload, a match I agreed to shows the wait, not the button", async ({ browser }) => {
  test.setTimeout(150_000);
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const boris = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(anya);
  await register(boris, { name: "Борис", age: "31" });

  const run = Date.now().toString(36);
  const aText = `гуляю у моря, если кто рядом ${run}`;
  const bText = `иду к морю ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");

  // A agrees and waits.
  const matchId = await openMatch(anya, "Борис");
  await expect(anya.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "no");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });

  // A reload: the PIN, the inbox, the same match — still waiting, no button.
  await anya.evaluate(() => sessionStorage.clear());
  await anya.reload();
  await unlock(anya, PIN);
  await expect(anya.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  expect(await openMatch(anya, "Борис")).toBe(matchId);
  await expect(anya.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "yes");
  await expect(anya.getByTestId("waiting")).toBeVisible();
  await expect(anya.getByTestId("talk")).toHaveCount(0);

  // B, who has not answered, is still offered the button.
  expect(await openMatch(boris, "Аня")).toBe(matchId);
  await expect(boris.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "no");
  await expect(boris.getByTestId("talk")).toBeVisible();
});
