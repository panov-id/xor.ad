// The onboarding wizard (goal Ц4, sheets adaptive-*-wizard-1..4): after the first registration on a device
// it opens — five steps (the fifth: where you are, no silent Rome), skippable, the last one's main button is «start» — and it opens again from «я».
// The fixture marks the wizard seen for every other spec; this one opts out.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

test.use({ wizardSeen: false });

const box = async (locator: import("@playwright/test").Locator) => (await locator.boundingBox())!;

test("wizard: shown after registration, five steps, the place picked on the last, start lands on the feed there, replayed from me, skipped", async ({ page }) => {
  await register(page, undefined, undefined, true);

  // Step 1: the examples and the button share the left edge, the step dots and the × one axis,
  // and the words stand 24 under the examples.
  await expect(page.getByTestId("wizard-1")).toBeVisible();
  await expect(page.getByTestId("wizard-start")).toHaveCount(0);
  const example = await box(page.locator('[data-part="example"]').first());
  const examples = page.locator('[data-part="example"]');
  const lastExample = await box(examples.last());
  const button = await box(page.getByTestId("wizard-next"));
  expect(Math.abs(example.x - button.x)).toBeLessThanOrEqual(1);
  const dots = await box(page.locator('[data-part="dots"]'));
  const close = await box(page.getByTestId("wizard-skip"));
  expect(Math.abs(dots.y + dots.height / 2 - (close.y + close.height / 2))).toBeLessThanOrEqual(1);
  const title = await box(page.getByRole("heading", { level: 1 }));
  expect(Math.round(title.y - (lastExample.y + lastExample.height))).toBe(24);

  // Steps 2..5: each has its own testid; only the last one holds «start».
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-2")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-3")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-4")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  // Step 5: where you are. Nothing is chosen yet — no silent Rome; the browser is never asked.
  await expect(page.getByTestId("wizard-5")).toBeVisible();
  await expect(page.getByTestId("wizard-next")).toHaveCount(0);
  await expect(page.getByTestId("place-now")).toHaveText("место не выбрано");
  expect(await page.evaluate(() => localStorage.getItem("place.v1"))).toBeNull();
  // A point that is no point says so; a city found by its name is taken and kept on the device.
  await page.getByTestId("place-point").fill("not a point");
  await page.getByTestId("place-use").click();
  await expect(page.getByTestId("error")).toBeVisible();
  await page.getByTestId("place-search").fill("Limas");
  await page.getByTestId("place-city").first().click();
  await expect(page.getByTestId("place-now")).toHaveText("место: Limassol");
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("place.v1")))!).name).toBe("Limassol");
  await page.getByTestId("wizard-start").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-screen="feed"]')).toContainText("Limassol");
  await expect(page.getByTestId("wizard-1")).toHaveCount(0);

  // Replay from «я»: the same five steps, the place already chosen; ending it returns to «я».
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-wizard").click();
  await expect(page.getByTestId("wizard-1")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-5")).toBeVisible();
  await expect(page.getByTestId("place-now")).toHaveText("место: Limassol");
  await page.getByTestId("wizard-start").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible();

  // Skip, from any step, ends it at once.
  await page.getByTestId("me-wizard").click();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-2")).toBeVisible();
  await page.getByTestId("wizard-skip").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible();
});

test("wizard: skipped at the first step after registration, the feed opens and it is not shown again", async ({ page }) => {
  await register(page, undefined, undefined, true);
  await page.getByTestId("wizard-skip").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => localStorage.getItem("wizard-seen"))).toBe("1");
  // No place was chosen: the feed says so plainly instead of pretending to be in Rome.
  await expect(page.locator('[data-screen="feed"]')).toContainText("место не выбрано");
  await expect(page.locator('[data-screen="feed"]')).not.toContainText("Rome");
  await page.getByTestId("nav-tables").click();
  await page.getByTestId("nav-feed").click();
  await expect(page.getByTestId("wizard-1")).toHaveCount(0);
});
