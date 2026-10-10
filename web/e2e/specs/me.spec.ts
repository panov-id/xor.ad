// "Me" end to end (W4): the name goes to the queue and the row says so; the
// PIN changes and the vault is re-sealed under it — proved by a reload that
// opens with the new PIN and not the old; a step away and the way back; and
// "start again", after which the device remembers nothing. Every step is
// read back from the node's answers, not from the screen alone.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, runLabel, unlock, watch } from "./helpers.ts";


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

  // A name the model refuses ("тг" is a messenger; the stand's stub says
  // reject): PATCH answers 422, the editor says why, and the old name stands —
  // nothing waits (WP-4). A clean name is accepted at once (the case at the
  // end of this file).
  await page.getByTestId("me-name").click();
  await expect(page.locator('[data-screen="edit-name"]')).toBeVisible();
  await page.getByTestId("edit-value").fill("Оля тг");
  await page.getByTestId("edit-save").click();
  // The reason is a phrase of the dictionary (quorum 2026-10-10), never the model's own English text.
  await expect(page.getByTestId("error")).toContainText("Имя не принято.", { timeout: 15000 });
  await expect(page.getByTestId("error")).not.toContainText("stub");
  await page.getByTestId("edit-back").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "accepted");
  await expect(page.getByTestId("me-name")).toContainText("Аня");
  expect(nodeAnswers.filter(([m, p]) => m === "PATCH" && p === "/identities/me").map(([, , s]) => s)).toEqual([422]);

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

// W13-NR, WP-4 · a refusal is said to its author with its reason. Nobody but
// the model reads a phrase or a name (owner, 09.10.2026): the stand's stub
// refuses one carrying a messenger, and the author sees why on the spot — in
// the composer for a phrase, in the editor for a name — and the old name
// stands. Nothing goes to a queue, so nothing waits on «me».
test("a phrase and a name the model refused are said to the author with the reason, and nothing waits", async ({ page }) => {
  const stamp = runLabel();
  const posts: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") posts.push(r.status()); });
  watch(page, []);
  await register(page);

  // The phrase: refused in the composer, with the model's reason.
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await page.getByTestId("text").fill(`пиши в тг, договоримся ${stamp}`);
  await page.getByTestId("send").click();
  await expect(page.getByTestId("refused")).toContainText("Фраза не принята.", { timeout: 15000 });
  await expect(page.getByTestId("refused")).not.toContainText("stub");
  expect(posts, "the model's refusal did not reach the author as a refusal").toEqual([422]);
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();

  // The name: refused in the editor, and the row still opens the editor.
  await page.getByTestId("back").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-name").click();
  await page.getByTestId("edit-value").fill("Оля тг");
  await page.getByTestId("edit-save").click();
  // The reason is a phrase of the dictionary (quorum 2026-10-10), never the model's own English text.
  await expect(page.getByTestId("error")).toContainText("Имя не принято.", { timeout: 15000 });
  await expect(page.getByTestId("error")).not.toContainText("stub");
  await page.getByTestId("edit-back").click();
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "accepted");
  await expect(page.getByTestId("me-name")).toContainText("Аня");
  await expect(page.getByTestId("me-name")).not.toContainText("на проверке");
  await page.getByTestId("me-name").click();
  await expect(page.locator('[data-screen="edit-name"]')).toBeVisible();
});

// WP-1 (2026-10-09): a name the rules find nothing in is the name at once —
// PATCH answers 200 and nothing says "на проверке".
test("a clean new name is accepted at once on «me»", async ({ page }) => {
  const answers: Array<[string, number]> = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/identities/me") answers.push([r.request().method(), r.status()]);
  });
  watch(page, []);
  await register(page);
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-name").click();
  await page.getByTestId("edit-value").fill("Оля");
  await page.getByTestId("edit-save").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-screen="me"]')).toHaveAttribute("data-name-state", "accepted", { timeout: 15000 });
  await expect(page.getByTestId("me-name")).toContainText("Оля");
  await expect(page.getByTestId("me-name")).not.toContainText("на проверке");
  expect(answers.filter(([m]) => m === "PATCH").map(([, s]) => s)).toEqual([200]);
});
