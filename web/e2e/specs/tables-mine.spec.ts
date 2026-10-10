// «Мои столы» on the tables tab (П18b; GET /tables `mine`): the table one sits
// at is there with «сижу здесь», and a table one liked is marked «лайкнут» —
// tables the list below leaves out, as the feed does. Женя sets a table and
// finds it in her block, seated and not liked; Аня sits down by its card,
// likes it, and finds it in hers with both marks; the list holds it for neither.
//
// The table screen has no way out but standing up (table-stand), and standing
// up ends the seat, so each comes back to the tabs as a person would after
// closing the page: a reload and the PIN.

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/address.ts";
import { newTable, openTables, PIN, register, runLabel, sitFromTables, unlock } from "./helpers.ts";

async function backToTabs(page: Page): Promise<void> {
  await page.reload();
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="feed"], [data-screen="table"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.locator('[data-screen="table"]').count()) throw new Error("the reload came back to the table: there is no way to the tabs while seated");
  await openTables(page);
}

test("my tables: the one I sit at is marked seated, the one I liked is marked liked, and the list leaves them out", async ({ browser }) => {
  test.setTimeout(180_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });

  const name = `скамейка ${runLabel()}`;
  await newTable(zhenya, { name });
  await backToTabs(zhenya);
  const zhenyaMine = zhenya.getByTestId("tables-mine").getByTestId("table-mine").filter({ hasText: name });
  await expect(zhenyaMine).toHaveCount(1, { timeout: 30000 });
  await expect(zhenyaMine).toContainText("сижу здесь");
  await expect(zhenyaMine).not.toContainText("лайкнут");
  await expect(zhenya.getByTestId("table-card").filter({ hasText: name })).toHaveCount(0);

  await sitFromTables(anya, name);
  await anya.getByRole("button", { name: "лайк", exact: true }).click();
  await backToTabs(anya);
  const anyaMine = anya.getByTestId("tables-mine").getByTestId("table-mine").filter({ hasText: name });
  await expect(anyaMine).toHaveCount(1, { timeout: 30000 });
  await expect(anyaMine).toContainText("сижу здесь");
  await expect(anyaMine).toContainText("лайкнут");
  await expect(anya.getByTestId("table-card").filter({ hasText: name })).toHaveCount(0);

  // The card opens the table, as a card of the list does.
  await anyaMine.click();
  await expect(anya.getByTestId("table")).toBeVisible({ timeout: 30000 });
});
