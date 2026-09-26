// What every spec of the web face starts with: a fresh registration through
// the screens — the name, the age, the consent, the PIN twice, the paper code
// typed back — and the feed answering 200. Shared so that two specs cannot
// drift in what "registered" means.

import { expect, type Page } from "@playwright/test";

export const PIN = "123456";

export function watch(page: Page, feedAnswers: number[]): void {
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/feed" && r.request().method() === "GET") feedAnswers.push(r.status());
  });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[page ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (!/\.(js|css|html|ico|json)$/.test(path) && path !== "/") console.log(`[node] ${r.request().method()} ${path} → ${r.status()}`);
  });
  page.on("requestfailed", (r) => console.log(`[request failed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
}

export async function register(page: Page, who = { name: "Аня", age: "28" }): Promise<string[]> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Что говорят соседи рядом." })).toBeVisible();
  await page.getByTestId("start").click();
  await expect(page.locator('[data-screen="register-1"]')).toBeVisible();
  await page.getByTestId("name").fill(who.name);
  await page.getByTestId("age").fill(who.age);
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await expect(page.locator('[data-screen="register-2"]')).toBeVisible();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-again").fill(PIN);
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  return code;
}

export async function unlock(page: Page, pin: string): Promise<void> {
  await expect(page.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId("unlock-pin").fill(pin);
  await page.getByTestId("unlock").click();
}
