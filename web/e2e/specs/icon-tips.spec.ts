// Icon tips (web/src/ui/iconTips.ts, owner 12.10.2026): an icon-only button shows
// its word in a bubble — on a mouse hover, on keyboard focus, on a long press —
// and a long press does not press the button.

import { expect, test } from "../fixtures/address.ts";

test("a mouse hover over the splash's key shows its word", async ({ page }) => {
  await page.goto("/");
  const key = page.getByTestId("restore");
  const word = await key.getAttribute("aria-label");
  await key.hover();
  await expect(page.locator(".ui-icon-tip")).toBeVisible();
  await expect(page.locator(".ui-icon-tip")).toHaveText(word!);
  await page.mouse.move(0, 0);
  await expect(page.locator(".ui-icon-tip")).toBeHidden();
});

test("keyboard focus on an icon button shows its word", async ({ page }) => {
  await page.goto("/");
  const start = page.getByTestId("start");
  await page.keyboard.press("Tab");
  for (let i = 0; i < 8 && !(await start.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(page.locator(".ui-icon-tip")).toHaveText((await start.getAttribute("aria-label"))!);
});

test("a long press shows the word and does not press the button", async ({ page }) => {
  await page.goto("/");
  const key = page.getByTestId("restore");
  const box = (await key.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await page.waitForTimeout(700);
  await expect(page.locator(".ui-icon-tip")).toHaveText((await key.getAttribute("aria-label"))!);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  await expect(page.getByTestId("restore")).toBeVisible();
});
