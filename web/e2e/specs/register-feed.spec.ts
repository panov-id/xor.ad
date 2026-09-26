// The one path W1 promises: a person opens the page, registers with a PIN and
// the paper code, and reads the feed — against a live node, in a browser.
// What is read back is not the screen alone: the node's answer to the feed
// (200), the record the vault kept, and that its seal opens under the same
// PIN and share (the page checks that and says so in the footer).

import { expect, test } from "@playwright/test";

test("registration with a PIN and the paper code, then the feed", async ({ page }) => {
  const feedAnswers: number[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/feed" && r.request().method() === "GET") feedAnswers.push(r.status());
  });
  // What the page said when something went wrong: the console, uncaught
  // errors, and every call to the node with its status — printed, so a red run
  // names its cause instead of a timeout.
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[page ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  page.on("response", (r) => { if (!/\.(js|css|html|ico)$/.test(new URL(r.url()).pathname) && new URL(r.url()).pathname !== "/") console.log(`[node] ${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`); });
  page.on("requestfailed", (r) => console.log(`[request failed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Что говорят соседи рядом." })).toBeVisible();
  await page.getByTestId("start").click();

  // Step 1: "next" stays off until the three documents are accepted (Н1).
  await expect(page.locator('[data-screen="register-1"]')).toBeVisible();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await expect(page.getByTestId("next")).toBeDisabled();
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();

  // Step 2: the PIN twice; an easy one warns and does not stop.
  await expect(page.locator('[data-screen="register-2"]')).toBeVisible();
  await page.getByTestId("pin").fill("123456");
  await page.getByTestId("pin-again").fill("123456");
  await expect(page.getByText("этот ПИН легко угадать")).toBeVisible();
  await page.getByTestId("register").click();

  // The paper code: four groups of four; the second and the fourth typed back.
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  expect(code).toHaveLength(4);
  for (const group of code) expect(group).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
  // A wrong group is refused before anything is sent.
  await page.getByTestId("group-2").fill(code[3]);
  await page.getByTestId("group-4").fill(code[1]);
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("error")).toContainText("группы не сходятся");
  // The right ones, typed the way a person types: lower case and a dash.
  await page.getByTestId("group-2").fill(code[1].toLowerCase());
  await page.getByTestId("group-4").fill(`${code[3].slice(0, 2)}-${code[3].slice(2)}`);
  await page.getByTestId("confirm").click();

  // The feed: the node answered 200, the screen says quiet or shows cards.
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feedAnswers.length).toBeGreaterThan(0);
  expect(feedAnswers[feedAnswers.length - 1]).toBe(200);
  const quiet = await page.getByTestId("quiet").isVisible();
  const cards = await page.getByTestId("card").count();
  expect(quiet || cards > 0).toBe(true);

  // The vault kept a sealed record, and the seal opens.
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "ok");
  const record = await page.evaluate(() =>
    new Promise<{ identityId: string; sessionId: string; sealedLength: number; salt: number } | null>((resolve) => {
      const req = indexedDB.open("xor-vault", 1);
      req.onsuccess = () => {
        const get = req.result.transaction("identity").objectStore("identity").get("me");
        get.onsuccess = () => {
          const r = get.result;
          resolve(r ? { identityId: r.identityId, sessionId: r.sessionId, sealedLength: r.sealedLong.length, salt: r.deviceSalt.length } : null);
        };
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    })
  );
  expect(record).not.toBeNull();
  expect(record!.identityId).toMatch(/^[0-9a-f-]{36}$/);
  expect(record!.sessionId.length).toBeGreaterThan(0);
  expect(record!.salt).toBe(16);
  // iv(12) + pkcs8 of a P-256 key (138 bytes) + GCM tag (16).
  expect(record!.sealedLength).toBe(12 + 138 + 16);

  // A reload: the device remembers, the PIN opens — through the node. A wrong
  // PIN is the node's refusal with the attempts left; the right one seats the
  // long key again, and the feed answers 200 to a call signed by it (W1c).
  // As a new tab would: the tab's own record (chat/tab_session.ts) is for a
  // reload of the tab that registered; without its id the vault is the way
  // back, and the PIN opens it.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId("unlock-pin").fill("654321");
  await page.getByTestId("unlock").click();
  await expect(page.getByTestId("error")).toContainText("осталось попыток: 9", { timeout: 30000 });
  await page.getByTestId("unlock-pin").fill("123456");
  const before = feedAnswers.length;
  await page.getByTestId("unlock").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feedAnswers.length).toBeGreaterThan(before);
  expect(feedAnswers[feedAnswers.length - 1]).toBe(200);
});
