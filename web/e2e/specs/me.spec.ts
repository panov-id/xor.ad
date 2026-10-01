// "Me" end to end (W4): the name goes to the queue and the row says so; the
// PIN changes and the vault is re-sealed under it — proved by a reload that
// opens with the new PIN and not the old; a step away and the way back; and
// "start again", after which the device remembers nothing. Every step is
// read back from the node's answers, not from the screen alone.

import { expect, test, type Page } from "../fixtures/address.ts";
import { devices } from "@playwright/test";
import { PIN, register, runLabel, unlock, watch } from "./helpers.ts";

const PANEL_URL = process.env.PANEL_URL ?? "";
const SECRET = process.env.PANEL_SESSION_SECRET ?? "";
const ENV_NAME = process.env.PANEL_ENV_NAME ?? "test";
const MODERATOR = "moderator@webtest.invalid";

test("me: the name to the queue, the PIN changed and the vault re-sealed, away and back, start again", async ({ page }) => {
  const feedAnswers: number[] = [];
  const nodeAnswers: Array<[string, string, number]> = [];
  watch(page, feedAnswers);
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (["/identities/me", "/vault/pin", "/away", "/identities/close", "/statements"].includes(path)) nodeAnswers.push([r.request().method(), path, r.status()]);
  });
  await register(page);

  // Into "me": the name row shows the name, and nothing waits.
  await page.getByTestId("tab-me").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible();
  await expect(page.getByTestId("me-name")).toContainText("Аня");
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "accepted");

  // The name: PATCH answers 202, the row says "→ Оля · на проверке".
  await page.getByTestId("me-name").click();
  await expect(page.locator('[data-screen="edit-name"]')).toBeVisible();
  await page.getByTestId("edit-value").fill("Оля");
  await page.getByTestId("edit-save").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "pending", { timeout: 15000 });
  await expect(page.getByTestId("me-name")).toContainText("→ Оля · на проверке");
  expect(nodeAnswers.filter(([m, p]) => m === "PATCH" && p === "/identities/me").map(([, , s]) => s)).toEqual([202]);

  // The age within the band: 200, the row shows it.
  await page.getByTestId("me-age").click();
  await page.getByTestId("edit-value").fill("29");
  await page.getByTestId("edit-save").click();
  await expect(page.getByTestId("me-age")).toContainText("29", { timeout: 15000 });

  // The PIN: a wrong current one is the node's refusal with the attempts
  // left; the right one changes it and the vault is re-sealed.
  await page.getByTestId("me-pin").click();
  await expect(page.locator('[data-screen="change-pin"]')).toBeVisible();
  await page.getByTestId("pin-current").fill("000000");
  await page.getByTestId("pin-next").fill("246810");
  await page.getByTestId("pin-again").fill("246810");
  await page.getByTestId("pin-go").click();
  await expect(page.getByTestId("error")).toContainText("Осталось попыток: 9", { timeout: 30000 });
  await page.getByTestId("pin-current").fill(PIN);
  await page.getByTestId("pin-go").click();
  await expect(page.getByTestId("pin-changed")).toContainText("ПИН сменён.", { timeout: 30000 });
  expect(nodeAnswers.filter(([, p]) => p === "/vault/pin").map(([, , s]) => s)).toEqual([200]);
  await page.getByTestId("pin-back").click();

  // A reload: the old PIN is refused by the node (its counter), the new one
  // opens the re-sealed vault and the feed answers 200 to the seated key.
  // A plain reload: the vault is the only way back, and the PIN opens it.
  await page.reload();
  await unlock(page, PIN);
  await expect(page.getByTestId("error")).toContainText("Осталось попыток", { timeout: 30000 });
  const before = feedAnswers.length;
  await unlock(page, "246810");
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feedAnswers.length).toBeGreaterThan(before);
  expect(feedAnswers[feedAnswers.length - 1]).toBe(200);

  // Away for twenty minutes: the price is shown once a span is chosen, the
  // node answers 200 with until, the screen is the away one; back early.
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-away").click();
  await expect(page.locator('[data-screen="step-away"]')).toBeVisible();
  await expect(page.getByTestId("away-go")).toBeDisabled();
  await page.getByTestId("away-short").click();
  await expect(page.getByTestId("away-price")).toContainText("фраз исчезнет: 0", { timeout: 15000 });
  await page.getByTestId("away-go").click();
  await expect(page.locator('[data-screen="away"]')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("away-line")).toContainText("Вы отошли.");
  expect(nodeAnswers.filter(([m, p]) => m === "POST" && p === "/away").map(([, , s]) => s)).toEqual([200]);
  await page.getByTestId("away-return").click();
  await expect(page.getByTestId("away-sure")).toBeVisible();
  await page.getByTestId("away-return").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  expect(nodeAnswers.filter(([m, p]) => m === "DELETE" && p === "/away").map(([, , s]) => s)).toEqual([204]);

  // The statements were asked once per seated client — at registration and
  // once more after the reload — and never again while the client lives:
  // none, so no screen; "me" shows no restrictions row.
  expect(nodeAnswers.filter(([, p]) => p === "/statements").map(([, , s]) => s)).toEqual([200, 200]);
  await page.getByTestId("tab-me").click();
  await expect(page.getByTestId("me-statements")).toHaveCount(0);

  // Start again: the price, the PIN, 200 — and the device forgets: a reload
  // is the splash, not the PIN.
  await page.getByTestId("me-reset").click();
  await expect(page.locator('[data-screen="reset"]')).toBeVisible();
  await expect(page.getByTestId("reset-price")).toContainText("исчезнет фраз: 0", { timeout: 15000 });
  // What cannot be undone is on the screen before the PIN, not behind ⓘ.
  for (const id of ["reset-warning", "reset-code"]) await expect(page.getByTestId(id), `${id} is visible`).toBeVisible();
  await page.getByTestId("reset-pin").fill("246810");
  await page.getByTestId("reset-go").click();
  await expect(page.locator('[data-screen="splash"]')).toBeVisible({ timeout: 30000 });
  expect(nodeAnswers.filter(([, p]) => p === "/identities/close").map(([, , s]) => s)).toEqual([200]);
  await page.reload();
  await expect(page.locator('[data-screen="splash"]')).toBeVisible({ timeout: 15000 });
});

// W13-NR · a refused name is said to its author (§8.2, chat_RU.md:866). The
// name goes to the queue with a phrase; the moderator refuses the name in the
// panel (as moderation-path.spec walks it); "me" then says the name was not
// accepted and the phrase waits — and the row still opens the editor.
async function panelToken(): Promise<string> {
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const enc = new TextEncoder();
  const header = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64(enc.encode(JSON.stringify({
    sub: MODERATOR, role: "moderator", brand: null, env: ENV_NAME, exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64(sig)}`;
}

async function writeFlagged(page: Page, text: string): Promise<void> {
  const posts: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") posts.push(r.status()); });
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  expect(posts, "the rules did not send the phrase to the queue").toEqual([202]);
}

test("a name the moderator refused is said on «me», and the row still opens the editor", async ({ browser }) => {
  expect(PANEL_URL && SECRET, "the stand's panel and its session secret (docker-compose.web.yml e2e)").toBeTruthy();
  test.setTimeout(180_000);
  const stamp = runLabel();
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await a.newPage();
  watch(page, []);
  await register(page);
  // The name to the queue, then a phrase that waits there with it.
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-name").click();
  await page.getByTestId("edit-value").fill("Оля");
  await page.getByTestId("edit-save").click();
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "pending", { timeout: 15000 });
  await page.getByTestId("me-back").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  await writeFlagged(page, `пиши в тг, договоримся ${stamp}`);

  // The moderator: the name, not the phrase.
  // On a desktop and without the storefront's headers, as moderation-path.spec
  // explains: at a phone's width the panel has no "Feed queue" link, and the
  // node's CORS refuses the Bunny headers from the panel.
  const m = await (await browser.newContext({ ...devices["Desktop Chrome"] })).newPage();
  await m.context().setExtraHTTPHeaders({});
  const token = await panelToken();
  await m.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ["panel_jwt", token]);
  await m.goto(PANEL_URL);
  await m.getByRole("link", { name: "Feed queue" }).click();
  await expect(m.getByRole("heading", { name: "Feed queue" })).toBeVisible();
  const row = m.getByRole("row", { name: new RegExp(`тг, договоримся ${stamp}`) });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Refuse name" }).click();
  await expect(row.getByText("name rejected")).toBeVisible({ timeout: 15000 });

  // The author: "me" says the name was not accepted, and the row opens the editor.
  await page.getByTestId("tab-me").click();
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "rejected", { timeout: 15000 });
  await expect(page.getByTestId("me-name")).toContainText("имя не принято, фраза ждёт нового имени");
  await expect(page.getByTestId("me-name")).not.toContainText("на проверке");
  await page.getByTestId("me-name").click();
  await expect(page.locator('[data-screen="edit-name"]')).toBeVisible();
  await a.close();
});
