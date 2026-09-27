// What every spec of the web face starts with: a fresh registration through
// the screens — the name, the age, the consent, the PIN twice, the paper code
// typed back — and the feed answering 200. Shared so that two specs cannot
// drift in what "registered" means.

import { expect, type Page } from "../fixtures/address.ts";

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

// A phrase through the composer, as a person writes one (W16): the node's
// answer is read on the feed.
export async function writePhrase(page: Page, text: string): Promise<void> {
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  await expect(page.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });
}

// A like from the card, as a person gives one (W16): the feed read again, the
// phrase's card opened, "нравится" pressed. Returns what the card said —
// "liked", or "matched" when the other side liked first.
export async function likeByCard(page: Page, text: string): Promise<"liked" | "matched"> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("nav-feed").click();
  const card = page.getByTestId("card").filter({ hasText: text });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.click();
  await page.getByTestId("like").click();
  await expect(page.locator('[data-testid="liked"], [data-testid="matched"]').first()).toBeVisible({ timeout: 15000 });
  const state = (await page.getByTestId("matched").isVisible()) ? "matched" : "liked";
  await page.getByTestId("back").click();
  return state;
}

// The match with this person, opened from the inbox; its id is the row's.
export async function openMatch(page: Page, name: string): Promise<string> {
  await page.getByTestId("nav-inbox").click();
  const row = page.getByTestId("match").filter({ hasText: name });
  await expect(row).toHaveCount(1, { timeout: 30000 });
  const id = (await row.getAttribute("data-id"))!;
  await row.getByTestId("open-match").click();
  await expect(page.locator('[data-screen="match"]')).toBeVisible();
  return id;
}

// A table from the feed's "new table" (W10), and the one who set it lands at it.
export async function newTable(page: Page, t: { name: string; kind?: string; set?: string }): Promise<void> {
  await page.getByTestId("new-table").click();
  await expect(page.locator('[data-screen="new-table"]')).toBeVisible();
  if (t.kind) await page.getByTestId("new-table-class").selectOption(t.kind);
  if (t.set) await page.getByTestId("new-table-set").selectOption(t.set);
  await page.getByTestId("new-table-name").fill(t.name);
  await page.getByTestId("new-table-go").click();
  await expect(page.getByTestId("table")).toBeVisible({ timeout: 30000 });
}

// A neighbour reads the feed again and sits down by the table's card.
export async function sitFromFeed(page: Page, name: string): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("nav-feed").click();
  const card = page.getByTestId("table-card").filter({ hasText: name });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.click();
  await expect(page.getByTestId("table")).toBeVisible({ timeout: 30000 });
}

// Two at a table and a game begun, all by the screen (W15): the one who set
// it writes three phrases for the table to stand among and sets it; the other
// sits by its card and applies with a line of their own; the first starts the
// game, which takes the applicant in.
export async function twoAtATable(first: Page, second: Page, t: { name: string; kind?: string; set?: string }): Promise<void> {
  for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) {
    await writePhrase(first, `${text} ${Date.now().toString(36)}`);
  }
  await newTable(first, t);
  await sitFromFeed(second, t.name);
  await second.getByTestId("line-input").fill("сыграю");
  await second.getByTestId("apply").click();
  await expect(first.getByTestId("table")).toContainText("заявка", { timeout: 15000 });
  await first.getByTestId("start-game").click();
  await expect(first.getByTestId("turn")).not.toContainText("партия ещё не началась", { timeout: 15000 });
  await expect(second.getByTestId("turn")).not.toContainText("партия ещё не началась", { timeout: 15000 });
}
