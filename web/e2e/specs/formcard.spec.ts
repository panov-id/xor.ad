// The entry screens keep their errors inside the form card (strict review
// 11.10, К4): the PIN pair that does not match says so on the second strip,
// and a wrong PIN after a reload says the tries left — in both, no error line
// stands outside .ui-form-card.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register } from "./helpers.ts";

test("register-2 and unlock: the error line is inside the form card, the mismatch marks the second strip", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByRole("checkbox").check();
  await page.getByTestId("next").click();
  await expect(page.locator('[data-screen="register-2"]')).toBeVisible();
  await page.getByTestId("pin").fill("483920");
  await page.getByTestId("pin-again").fill("483921");
  await expect(page.getByTestId("pin-again")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("pin")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".ui-form-card .ui-pinpair .ui-error")).toHaveCount(1);
  await expect(page.locator(".ui-error:not(.ui-form-card .ui-error)"), "an error line stands outside the card on register-2").toHaveCount(0);
  await expect(page.locator('[data-screen="register-2"] .ui-info-row')).toHaveCount(0);

  await register(page);
  await page.reload();
  await expect(page.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  const wrong = PIN === "483920" ? "483921" : "483920";
  await page.getByTestId("unlock-pin").fill(wrong);
  await page.getByTestId("unlock").click();
  await expect(page.locator(".ui-form-card .ui-error")).toContainText(/\d/, { timeout: 15000 });
  await expect(page.locator(".ui-error:not(.ui-form-card .ui-error)"), "an error line stands outside the card on unlock").toHaveCount(0);
  await expect(page.getByTestId("unlock-restore")).toBeVisible();
});
