// The place QR end to end (screen 26; owner 19.09 and 12.10.2026): one person makes it from the place
// screen — a link `/location#p=…&s=…`, copy, the price line at 100 m; another opens the link, is asked,
// puts the point there, and the fragment is gone from the address. A malformed link is as if no QR.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

test("place QR: made on one device, opened on another, the point moves only when asked, the # is gone", async ({ browser }) => {
  const anya = await (await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  await register(anya);
  await anya.getByTestId("place").click();
  await anya.getByTestId("place-search").fill("Лимассол");
  await anya.getByTestId("place-city").first().click();

  await anya.getByTestId("place").click();
  await anya.getByTestId("place-qr").click();
  await expect(anya.locator('[data-screen="place-qr"]')).toBeVisible();
  await expect(anya.getByTestId("qr-price")).toHaveCount(0);
  await anya.getByTestId("qr-step-1").click();
  await expect(anya.getByTestId("qr-price")).toBeVisible();
  await anya.getByTestId("qr-step-3").click();
  await anya.getByTestId("qr-make").click();
  const link = await anya.getByTestId("qr-code").getAttribute("data-link");
  expect(link).toMatch(/\/location#p=-?\d+\.-?\d+&s=3$/);
  await anya.getByTestId("qr-copy").click();
  expect(await anya.evaluate(() => navigator.clipboard.readText())).toBe(link);

  const boris = await (await browser.newContext()).newPage();
  await register(boris, { name: "Борис", age: "30" });
  const before = await boris.getByTestId("place").getAttribute("aria-label");
  await boris.goto(link!);
  await unlock(boris, PIN);
  await expect(boris.getByTestId("qr-sheet")).toBeVisible();
  expect(new URL(boris.url()).hash).toBe("");
  await boris.getByTestId("qr-later").click();
  await expect(boris.getByTestId("place")).toHaveAttribute("aria-label", before ?? "");

  await boris.goto(link!);
  await unlock(boris, PIN);
  await boris.getByTestId("qr-put").click();
  await expect(boris.getByTestId("place")).not.toHaveAttribute("aria-label", before ?? "");
  expect(new URL(boris.url()).hash).toBe("");

  const after = await boris.getByTestId("place").getAttribute("aria-label");
  await boris.goto(link!.replace(/#.*/, "#p=../..&s=9"));
  await unlock(boris, PIN);
  await expect(boris.locator('[data-screen="feed"]')).toBeVisible();
  await expect(boris.getByTestId("qr-sheet")).toHaveCount(0);
  await expect(boris.getByTestId("place")).toHaveAttribute("aria-label", after ?? "");
});
