// The entry answers a press on its closed primary (perfectionist round 1, 12.10.2026):
// the reason under it turns to an alert, and two full PINs that differ are said to differ.

import { expect, test } from "../fixtures/address.ts";

test("a press on the closed «next» turns the reason into an alert", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await expect(page.locator('[data-screen="register-1"]')).toBeVisible();
  const reason = page.locator('[data-part="foot"] .ui-reason');
  await expect(reason).not.toHaveAttribute("data-pressed", "yes");
  // aria-disabled: Playwright waits for «enabled» forever, a person just taps it.
  await page.getByTestId("next").click({ force: true });
  await expect(reason).toHaveAttribute("data-pressed", "yes");
  await expect(page.getByRole("alert")).toContainText(await reason.textContent() ?? "");
});

test("two full PINs that differ are said to differ", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByRole("checkbox").check();
  await page.getByTestId("next").click();
  await expect(page.locator('[data-screen="register-2"]')).toBeVisible();
  const reason = page.locator('[data-part="foot"] .ui-reason');
  const general = await reason.textContent();
  await page.getByTestId("pin").fill("482913");
  await page.getByTestId("pin-again").fill("482914");
  await expect(reason).not.toHaveText(general ?? "");
  await expect(reason).toContainText("ПИН не совпадают");
  await page.getByTestId("register").click({ force: true });
  await expect(reason).toHaveAttribute("data-pressed", "yes");
});
