// «Мои столы» on the tables tab (П18b; GET /tables `mine`): the table one sits
// at is there with «сижу здесь», and a table one liked is marked «лайкнут» —
// tables the list below leaves out, as the feed does. Женя sets a table and
// finds it in her block, seated and not liked; Аня sits down by its card,
// likes it, and finds it in hers with both marks; the list holds it for neither.
//
// Each comes back to the tabs by the table's own "back" (TB1, owner 11.10.2026:
// «"Назад" без вставания»): the seat stays, so the table is in «Мои столы» and
// opens from there, still theirs.

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/address.ts";
import { newTable, openTables, register, runLabel, sitFromTables } from "./helpers.ts";

async function backToTabs(page: Page): Promise<void> {
  await page.locator('[data-screen="table"]').getByTestId("back").click();
  await expect(page.getByTestId("nav")).toBeVisible({ timeout: 15000 });
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

  // The card opens the table, as a card of the list does, and she is still seated there.
  await anyaMine.click();
  await expect(anya.getByTestId("table")).toBeVisible({ timeout: 30000 });
  // The table names one's own seat «вы», not by name.
  await expect(anya.getByTestId("table")).toContainText("сидят: Женя · вы");
  await expect(anya.getByTestId("table-stand")).toBeVisible();
});
