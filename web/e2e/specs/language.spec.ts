// The page speaks the browser's language (W13; web/src/locales/say.ts): an
// English browser gets the terminal's English for the words both faces share
// ("write", "me") and the web's own English for web-only words (the splash
// tagline). A Russian browser gets the Russian of both.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

test.describe("an English browser", () => {
  test.use({ locale: "en-US" });
  test("the shared words are the terminal's English", async ({ page }) => {
    await register(page, undefined, "What neighbours nearby are saying.");
    await expect(page.getByTestId("write")).toHaveAccessibleName("write");
    await expect(page.getByTestId("tab-me")).toHaveAccessibleName("me");
  });
});

test("a Russian browser reads Russian", async ({ page }) => {
  await register(page);
  await expect(page.getByTestId("write")).toHaveAccessibleName("написать");
  await expect(page.getByTestId("tab-me")).toHaveAccessibleName("я");
});

// WP-3: the person chooses, and the choice is kept on this device. Since 12.10.2026 the choice is the splash's
// first list (sheet adaptive-*-splash-lang): a Russian browser sees Russian ticked, picks Ukrainian, reads
// Ukrainian, and still does after a reload, where the browser alone would have brought Russian back; the list
// does not come again.
test.describe("a device that has not been asked", () => {
  test.use({ langAsked: false });
  test("the splash's list chooses the language, and the choice outlives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("lang-ru")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("start")).toHaveCount(0);
    await page.getByTestId("lang-uk").click();
    await expect(page.getByRole("heading", { name: "Що кажуть сусіди поруч." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Що кажуть сусіди поруч." })).toBeVisible();
    await expect(page.getByTestId("lang")).toHaveCount(0);
  });
  test("one tap on the ticked language keeps it and opens the splash, no reload", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("lang-ru").click();
    await expect(page.getByRole("heading", { name: "Что говорят соседи рядом." })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("start")).toBeVisible();
  });
});

// From "me": every language both dictionaries know is offered, and choosing one
// reloads the page in it — the PIN is asked again, as after any reload.
test("me: the language row offers every language and reloads the page in the chosen one", async ({ page }) => {
  await register(page);
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-lang").click();
  await expect(page.locator('[data-screen="lang"] [role="radio"]')).toHaveCount(17);
  await page.getByTestId("lang-en").click();
  await unlock(page, PIN);
  await expect(page.getByTestId("tab-me")).toHaveAccessibleName("me");
  // The reload was on /me: "me" opens (router.ts); "write" is the feed's.
  await page.getByTestId("nav-feed").click();
  await expect(page.getByTestId("write")).toHaveAccessibleName("write");
});
