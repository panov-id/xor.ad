// The other side's changed age in the web conversation (chat spec §8.2
// :1449-1452 "the client draws the line"; W14-AG), against a live node: Аня
// and Борис talk; Аня changes her age from "me" (PATCH /identities/me 200);
// Борис's open conversation gets the node's system frame {kind: age_changed,
// age}, draws «собеседник изменил возраст: 31» as a line and the header
// follows. Until now no face drew it.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, runLabel, writePhrase } from "./helpers.ts";

async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("30");
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill("246813");
  await page.getByTestId("pin-again").fill("246813");
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"]')).toBeVisible({ timeout: 30000 });
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
}

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${name} error] ${e.message}`));
  await register(page, name);
  return page;
}

async function openChat(page: Page) {
  await page.getByTestId("nav-feed").click();
  await page.getByTestId("nav-inbox").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(page.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
}

test("the other side's changed age comes as a system line, and the header follows", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const run = runLabel();
  const aText = `кто в парке к вечеру ${run}`;
  const bText = `иду в парк ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");
  await openMatch(anya, "Борис");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await openMatch(boris, "Аня");
  await expect(boris.locator('[data-screen="match"]')).toContainText("Уже согласились и ждут вас", { timeout: 15000 });
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await openChat(anya);
  await openChat(boris);
  await expect(boris.locator('[data-screen="chat"] h1')).toContainText("Аня, 30");

  // Аня changes her age from "me": PATCH /identities/me 200.
  const patches: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === "/identities/me" && r.request().method() === "PATCH") patches.push(r.status()); });
  await anya.getByTestId("back").click();
  await anya.getByTestId("tab-me").click();
  await anya.getByTestId("me-age").click();
  await anya.getByTestId("edit-value").fill("31");
  await anya.getByTestId("edit-save").click();
  await expect(anya.getByTestId("me-age")).toContainText("31", { timeout: 15000 });
  expect(patches).toEqual([200]);

  // Борис's open conversation: the line, and the header.
  await expect(boris.getByTestId("system").last()).toHaveText("собеседник изменил возраст: 31", { timeout: 20000 });
  await expect(boris.locator('[data-screen="chat"] h1')).toContainText("Аня, 31");
  await a.close();
  await b.close();
});
