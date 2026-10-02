// The theme picker end to end (Me → theme): a radio group of the brand's
// themes plus auto; a pick goes on <html> as data-theme, into meta
// theme-color and localStorage theme:<brand>, and survives a reload; the
// page's background is the theme's --bg. Auto clears the key.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

test("theme: pick, persist across a reload, back to auto", async ({ page }) => {
  await register(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-brand", "sosed");
  await expect(html).toHaveAttribute("data-theme-choice", "auto");

  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-theme").click();
  await expect(page.locator('[data-screen="theme"]')).toBeVisible();
  const group = page.getByRole("radiogroup");
  await expect(group).toBeVisible();
  expect(await group.getByRole("radio").count()).toBeGreaterThan(2);
  await expect(page.getByTestId("theme-auto").getByRole("radio")).toBeChecked();
  const box = await page.getByTestId("theme-violet").boundingBox();
  expect(box?.height ?? 0, "a theme row is a 48px target").toBeGreaterThanOrEqual(48);

  await page.getByTestId("theme-violet").getByRole("radio").check();
  await expect(html).toHaveAttribute("data-theme", "violet");
  expect(await page.evaluate(() => localStorage.getItem("theme:sosed"))).toBe("violet");
  const meta = await page.locator('meta[name="theme-color"]').getAttribute("content");
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(meta).toBe(bg);

  // Before the PIN: the theme is the device's, on <html> from the first module.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "violet");
  await unlock(page, PIN);

  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-theme").click();
  await page.getByTestId("theme-auto").getByRole("radio").check();
  await expect(html).toHaveAttribute("data-theme-choice", "auto");
  expect(await page.evaluate(() => localStorage.getItem("theme:sosed"))).toBeNull();
});
