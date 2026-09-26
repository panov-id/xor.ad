// W5, against a live node in a browser: the feed's header says how many
// people are near and tells a screen reader through a polite live region,
// once per change and not more often than the rule allows; the exit screen
// of an offer's link says the domain and whether the link is spent; and axe
// finds nothing serious or critical on the screens W1–W3 built.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "../fixtures/address.ts";

async function register(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("31");
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill("135790");
  await page.getByTestId("pin-again").fill("135790");
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

// Serious and critical only: the gate the task names. Everything axe finds is
// printed, so a run that goes red names the rule and the node.
async function axeClean(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  for (const v of results.violations) console.log(`[axe ${where}] ${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`);
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.impact} ${v.id}`), `axe on ${where}`).toEqual([]);
}

test("the header's live step reaches a polite region once per change, and the screens pass axe", async ({ page }) => {
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  const densities: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/feed/density") densities.push(r.status()); });

  await page.goto("/");
  await axeClean(page, "splash");
  await page.getByTestId("start").click();
  await expect(page.locator('[data-screen="register-1"]')).toBeVisible();
  await axeClean(page, "register-1");

  await register(page, "Аня");
  expect(densities.length).toBeGreaterThan(0);
  expect(densities[densities.length - 1]).toBe(200);

  // The live region: role status, polite, and it carries a step's words.
  const nearby = page.getByTestId("nearby");
  await expect(nearby).toHaveAttribute("aria-live", "polite");
  await expect(nearby).toHaveAttribute("role", "status");
  await expect(nearby).not.toHaveText("", { timeout: 15000 });
  const first = (await nearby.getAttribute("data-step"))!;
  expect(["none", "few", "about_ten", "tens", "hundreds"]).toContain(first);
  await axeClean(page, "feed");

  // Five radii in a second: the density is asked each time, the region does
  // not flicker — its text changes at most once within the rule's window.
  const before = densities.length;
  const seen = new Set<string>();
  for (const r of ["100", "300", "3000", "10000", "1000"]) {
    await page.getByTestId("radius").selectOption(r);
    seen.add((await nearby.getAttribute("data-step")) ?? "");
  }
  await expect.poll(() => densities.length, { timeout: 15000 }).toBeGreaterThanOrEqual(before + 5);
  seen.add((await nearby.getAttribute("data-step")) ?? "");
  expect(seen.size, "the polite region changed more than once inside the announcement window").toBeLessThanOrEqual(2);

  // The other screens W1–W3 built, as a person reaches them.
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await axeClean(page, "composer");
  await page.getByTestId("back").click();
  await page.getByTestId("likes").click();
  await expect(page.locator('[data-screen="likes"]')).toBeVisible();
  await axeClean(page, "likes");
  await page.getByTestId("back").click();
  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("nav-inbox")).toHaveAttribute("aria-current", "page");
  await axeClean(page, "inbox");
});

test("an offer's link with a code nobody issued lands on the exit screen's not-found, and it passes axe", async ({ page }) => {
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  // A code nobody issued: the node answers 404 and the page says so.
  await page.goto("/o/nosuchcode0001");
  await expect(page.locator('[data-screen="offer-exit"]')).toHaveAttribute("data-state", "missing", { timeout: 15000 });
  await expect(page.getByTestId("missing")).toContainText("Такой ссылки нет");
  await axeClean(page, "offer-exit missing");

  // A live and a switched-off link, against the seeded offers: offer.spec.ts (W5b).
});
