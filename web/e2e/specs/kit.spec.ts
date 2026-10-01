import { expect, test } from "@playwright/test";

// The comic kit (2026-10-01) on the stand's /kit page (web/src/ui/KitPreview.tsx).

test("the info balloon opens, takes focus, closes on Esc and on a press outside, and gives focus back", async ({ page }) => {
  await page.goto("/kit");
  const button = page.getByRole("button", { name: "пояснение" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  const balloon = page.getByRole("dialog", { name: "пояснение" });
  await expect(balloon, "the balloon opens on a press").toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(balloon, "focus moves into the balloon").toBeFocused();
  await page.keyboard.press("Escape");
  await expect(balloon, "Esc closes the balloon").toBeHidden();
  await expect(button, "focus is back on the info button after Esc").toBeFocused();
  await button.click();
  await expect(balloon).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(balloon, "a press outside closes the balloon").toBeHidden();
  await expect(button, "focus is back on the info button after a press outside").toBeFocused();
});

test("every icon button is named, and the like bursts on a press", async ({ page }) => {
  await page.goto("/kit");
  const icons = page.getByTestId("icons").getByRole("button");
  await expect(icons).toHaveCount(19);
  for (const b of await icons.all()) await expect(b).toHaveAttribute("aria-label", /\w/);
  await page.getByRole("button", { name: "♥ нравится" }).click();
  await expect(page.getByTestId("kit-burst")).toHaveClass(/ui-burst-on/);
  await expect(page.getByTestId("kit-burst")).toContainText("4");
});
