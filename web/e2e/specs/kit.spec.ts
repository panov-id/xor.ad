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
  await expect(icons).toHaveCount(41);
  for (const b of await icons.all()) await expect(b).toHaveAttribute("aria-label", /\w/);
  await page.getByRole("button", { name: "♥ нравится" }).click();
  await expect(page.getByTestId("kit-burst")).toHaveClass(/ui-burst-on/);
  await expect(page.getByTestId("kit-burst")).toContainText("4");
});

// The feed header's phase follows the clock while the page stays open (usePhase, a 60 s timer;
// verifier 01.10.2026): opened at 10:59 at the place (UTC+1, the stand's lon 12.5) it is morning,
// two minutes later — without a reload — it is day.
test("the live header turns from morning to day as the place's clock passes 11:00", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-01T09:59:00Z") });
  await page.goto("/kit");
  const header = page.getByTestId("live-phase").locator("header");
  await expect(header, "10:59 at the place is morning").toHaveAttribute("data-phase", "morning");
  await page.clock.runFor(2 * 60_000);
  await expect(header, "two minutes later, with no reload, the scene is day").toHaveAttribute("data-phase", "day");
});
