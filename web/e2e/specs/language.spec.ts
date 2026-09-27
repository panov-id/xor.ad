// The page speaks the browser's language (W13; web/src/locales/say.ts): an
// English browser gets the terminal's English for the words both faces share
// ("write", "me"); a web-only word, not translated yet, falls back to Russian
// (owner.md). A Russian browser gets the Russian of both.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

test.describe("an English browser", () => {
  test.use({ locale: "en-US" });
  test("the shared words are the terminal's English", async ({ page }) => {
    await register(page);
    await expect(page.getByTestId("write")).toHaveText("write");
    await expect(page.getByTestId("tab-me")).toHaveText("me");
  });
});

test("a Russian browser reads Russian", async ({ page }) => {
  await register(page);
  await expect(page.getByTestId("write")).toHaveText("написать");
  await expect(page.getByTestId("tab-me")).toHaveText("я");
});
