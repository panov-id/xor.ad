// Step К4 of the kit wave: the entry screens (splash, registration, restore,
// arrival, reissue, unlock, the lock) speak only through kit elements, and the
// defects of the 10.10.2026 text walk stay fixed (docs/plan-goal-2026-10-10_RU.md,
// the П table): П3 the page's lang and the picker's names, П4 the English
// splash, П9 a refused registration is said in words, П10 «дальше» says why it
// is off, П14/П15 the ⓘ buttons are not named like their fields, П11 dates.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register } from "./helpers.ts";

// The picker is the splash's first list since 12.10.2026 (sheet adaptive-*-splash-lang): a device not yet asked.
test.describe("a device that has not been asked", () => { test.use({ langAsked: false });
test("П3: <html lang> follows the interface language, the picker names every language in itself", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("lang-en")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const options = await page.getByTestId("lang").locator("button").evaluateAll((list) => list.map((o) => ({ value: (o.getAttribute("data-testid") ?? "").slice(5), lang: o.getAttribute("lang"), text: o.textContent })));
  expect(options.length).toBe(17);
  for (const o of options) expect(o.lang, `option ${o.value} carries its own lang`).toBe(o.value);
  const named = Object.fromEntries(options.map((o) => [o.value, o.text]));
  // The six that the browser's small ICU named in English («Belarusian», «Tajik» ...), and two Latin ones.
  expect(named).toMatchObject({ be: "Беларуская", hy: "Հայերեն", ka: "ქართული", kk: "Қазақша", ky: "Кыргызча", tg: "Тоҷикӣ", en: "English", de: "Deutsch" });
  expect(options.map((o) => o.text).join(" "), "no English exonym in the list").not.toMatch(/Belarusian|Armenian|Georgian|Kazakh|Kyrgyz|Tajik|Ukrainian|Russian/);
  // Choosing one reloads the page in it, and the document says so.
  await page.getByTestId("lang-uk").click();
  await expect(page.getByRole("heading", { name: "Що кажуть сусіди поруч." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await context.close();
});
});

test("П4: the English splash offers «Move the identity here» with a capital", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("arrive")).toHaveAccessibleName("Move the identity here");
  await context.close();
});

test("П10: age 12 — «дальше» is unavailable and says why beside it, tied by aria-describedby", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("12");
  await page.getByRole("checkbox").check();
  const next = page.getByTestId("next");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("disabled", /.*/);
  const reasonId = await next.getAttribute("aria-describedby");
  expect(reasonId, "the button is described by its reason").toBeTruthy();
  await expect(page.locator(`[id="${reasonId}"]`)).toHaveText("Пока нельзя: сюда пускают с 13 лет.");
  // The click does nothing, and the focus stays where it can be read.
  await next.click({ force: true });
  await expect(page.locator('[data-screen="register-1"]')).toBeVisible();
  // The age is the only thing missing: fix it and the reason goes with the lock.
  await page.getByTestId("age").fill("13");
  await expect(next).not.toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("aria-describedby", /.*/);
  await next.click();
  await expect(page.locator('[data-screen="register-2"]')).toBeVisible();
});

test("П9: the node's 429 on POST /identities is said in words at once, and the button is free again", async ({ page }) => {
  let refusals = 0;
  await page.route("**/identities", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    refusals++;
    await route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "30" }, body: JSON.stringify({ error: { code: "rate_limited" } }) });
  });
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByRole("checkbox").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-again").fill(PIN);
  await page.getByTestId("register").click();
  const line = page.getByTestId("error");
  await expect(line).toContainText("ошибка:", { timeout: 15000 });
  await expect(line).toContainText("слишком много регистраций");
  await expect(line).toContainText("Подождите немного и попробуйте ещё раз");
  await expect(line).not.toContainText("429");
  expect(refusals).toBe(1);
  // Not stuck: no busy mark, not off, and the same click goes through once the node lets it.
  const button = page.getByTestId("register");
  await expect(button).not.toHaveAttribute("aria-busy", "true");
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  await page.unroute("**/identities");
  await button.click();
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-screen="register-3"]')).toBeVisible();
});

test("П9: any other refusal says its number, a dropped call says it did not work", async ({ page }) => {
  await page.route("**/identities", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.continue()));
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByRole("checkbox").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-again").fill(PIN);
  await page.getByTestId("register").click();
  await expect(page.getByTestId("error")).toContainText("Узел не принял регистрацию (ответ 503)", { timeout: 15000 });
  await page.unroute("**/identities");
  await page.route("**/identities", (route) => (route.request().method() === "POST" ? route.abort("connectionreset") : route.continue()));
  await page.getByTestId("register").click();
  await expect(page.getByTestId("error")).toContainText("Регистрация не получилась", { timeout: 15000 });
  await expect(page.getByTestId("register")).not.toHaveAttribute("aria-busy", "true");
});

test("П14, П15: the ⓘ buttons are named apart from the fields and the headings; the new-PIN fields say «новый ПИН»", async ({ page, browser }) => {
  await register(page);
  // A screen on Screen gives the tab's title back when it leaves (the feed is not on Screen yet).
  expect(await page.title(), "the feed wears the title of the registration screen").not.toContain("Бумажный код");
  await page.reload();
  await expect(page.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  const field = await page.getByTestId("unlock-pin").evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? "");
  const info = page.getByTestId("unlock-info").getByRole("button");
  await expect(info).toHaveAccessibleName("о ПИНе");
  expect(field.trim(), "the field keeps its own name").toBe("ПИН, 6 цифр");
  expect(await info.getAttribute("aria-label"), "the ⓘ is not named like the field").not.toBe(field.trim());
  expect(await info.getAttribute("aria-label"), "the ⓘ is not named like the heading").not.toBe(await page.getByRole("heading", { level: 1 }).textContent());

  const fresh = await browser.newContext();
  const clean = await fresh.newPage();
  await clean.goto("/");
  await clean.getByTestId("restore").click();
  await expect(clean.locator('[data-screen="restore"]')).toBeVisible();
  await expect(clean.getByRole("textbox", { name: "новый ПИН", exact: true })).toHaveCount(1);
  await expect(clean.getByRole("textbox", { name: "новый ПИН ещё раз", exact: true })).toHaveCount(1);
  await expect(clean.getByTestId("restore-info").getByRole("button")).toHaveAccessibleName("о бумажном коде");
  // One ⓘ as on the sheet (adaptive-*-restore, 12.10): the new PIN's price is said inside it.
  await expect(clean.getByTestId("restore-info").getByRole("button")).toHaveCount(1);
  await clean.getByTestId("restore-info").getByRole("button").click();
  await expect(clean.getByTestId("restore-pin-info")).toBeVisible();
  const headings = await clean.getByRole("heading").allTextContents();
  for (const name of ["о бумажном коде"]) expect(headings, "an ⓘ is not named like a heading").not.toContain(name);
  await fresh.close();
});
