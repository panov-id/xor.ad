// Tables in the feed (W10; G1h), all by the screen: Женя writes three phrases
// through the composer and sets a table from the feed's "new table" at the
// page's own spot and circle; Аня, in the same circle, finds its card among
// Женя's phrases with one free seat, presses it, takes the seat and is at the
// table — both screens name her among the seated.

import { expect, test } from "../fixtures/address.ts";
import { newTable, register, runLabel, sitFromFeed, writePhrase } from "./helpers.ts";

test("a table set from the feed comes into a neighbour's feed, and its card seats her", async ({ browser }) => {
  test.setTimeout(150_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });

  // Phrases for the table to stand among (a table goes after every third).
  for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) {
    await writePhrase(zhenya, `${text} ${runLabel()}`);
  }
  const name = `фонтан ${runLabel()}`;
  await newTable(zhenya, { name });
  await expect(zhenya.getByTestId("table")).toContainText(`«${name}»`);

  await anya.getByTestId("nav-inbox").click();
  await anya.getByTestId("nav-feed").click();
  await expect(anya.getByTestId("table-card").filter({ hasText: name })).toContainText("свободно мест: 1", { timeout: 30000 });
  await sitFromFeed(anya, name);
  await expect(anya.getByTestId("table")).toContainText("Женя");
  await expect(zhenya.getByTestId("table")).toContainText("Аня", { timeout: 15000 });
});
