// The table as the text walk of 11.10.2026 read it (docs/walkthrough-2026-10-11_RU.md):
// С9 · an application is said once, «заявка: имя — слова», and goes when the
// applicant plays — «Борис — сыграю» hung on after the game; С8 · the boxes'
// letters have a legend, «В — вы» on each screen and the other's name in full.

import { expect, test } from "../fixtures/address.ts";
import { newTable, register, runLabel, sitFromTables, writePhrase } from "./helpers.ts";

const EDGE = /^линия: ряд \d+, колонка \d+, по (горизонтали|вертикали)$/;

test("an application is said once and goes when the game takes it; closed boxes' letters have a legend", async ({ browser }) => {
  test.setTimeout(240_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const boris = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(boris, { name: "Борис", age: "31" });
  for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) await writePhrase(zhenya, `${text} ${runLabel()}`);
  const name = `точки ${runLabel()}`;
  await newTable(zhenya, { name, kind: "dots", set: "2x2" });
  await sitFromTables(boris, name);
  await boris.getByTestId("line-input").fill("сыграю");
  await boris.getByTestId("apply").click();

  // С9 · one row, the applicant's words in it; not a second «Борис — сыграю».
  const application = zhenya.getByTestId("application");
  await expect(application, "the open application is not said").toHaveText("заявка: Борис — сыграю", { timeout: 15000 });
  await expect(zhenya.getByTestId("line").filter({ hasText: "сыграю" }), "the application is said twice").toHaveCount(0);

  await zhenya.getByTestId("start-game").click();
  await expect(zhenya.getByTestId("turn")).not.toContainText("партия ещё не началась", { timeout: 15000 });
  for (const p of [zhenya, boris]) {
    await expect(p.getByTestId("table"), "the application hangs on after the game took Борис in").not.toContainText("сыграю", { timeout: 15000 });
  }

  // С8 · play till a box closes; then each screen names whose letter is which.
  await expect(zhenya.getByTestId("dots-legend")).toHaveCount(0);
  for (let m = 0; m < 12 && (await zhenya.locator(".ui-board-box").count()) === 0; m++) {
    const mover = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход") ? zhenya : boris;
    const taken = await mover.locator("[data-taken]").count();
    await mover.getByRole("button", { name: EDGE }).first().click();
    await expect(mover.locator("[data-taken]")).toHaveCount(taken + 1, { timeout: 15000 });
  }
  await expect(zhenya.locator(".ui-board-box").first(), "no box closed in twelve moves").toBeVisible();
  const legend = (p: typeof zhenya) => p.getByTestId("dots-legend");
  await expect(legend(zhenya)).toBeVisible({ timeout: 15000 });
  await expect(legend(boris)).toBeVisible({ timeout: 15000 });
  // Whoever owns a box: «В — вы» on their own screen, the full name on the other's.
  const zText = (await legend(zhenya).textContent())!;
  const bText = (await legend(boris).textContent())!;
  expect(zText, "Женя's legend names neither her boxes nor Борис's").toMatch(/В — вы|Б — Борис/);
  if (zText.includes("В — вы")) expect(bText, "Борис's legend calls Женя's boxes his own").toContain("Ж — Женя");
  if (zText.includes("Б — Борис")) expect(bText, "Борис's legend does not call his boxes his").toContain("В — вы");
});
