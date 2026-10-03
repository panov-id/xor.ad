// The page speaks the browser's language (W13; web/src/locales/say.ts): an
// English browser gets the terminal's English for the words both faces share
// ("write", "me") and the web's own English for web-only words (the splash
// tagline). A Russian browser gets the Russian of both.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

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
