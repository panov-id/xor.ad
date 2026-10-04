// «Отправить снова» in the web conversation (chat spec :2388; W14-RS), against
// a live node. The node's "not stored" (202 {error: not_stored}, relay
// routes/chats.ts) cannot be caused on the stand without patching the node, so
// Аня's browser answers her first sends of a line with it (Playwright route);
// what is resent goes to the real node. A failed line shows «отправить снова»;
// the press sends it at once, and left alone it goes by itself on the
// schedule (at once, then 5 s, ...). Every send of a line carries the same
// local_id, and Борис gets each line once.

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

test("a line the node did not store goes again with its local_id, by the press and by itself", async ({ browser }) => {
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
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await openChat(anya);
  await openChat(boris);

  // Аня's sends of a line: the first `fail` of them are answered «not stored»
  // by her browser; every send's local_id is kept per line.
  const sends = new Map<string, string[]>();
  let fail = 0;
  await anya.route("**/chats/*/messages", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const localId = (request.postDataJSON() as { local_id: string }).local_id;
    const key = [...sends.keys()].find((k) => sends.get(k)!.includes(localId)) ?? localId;
    sends.set(key, [...(sends.get(key) ?? []), localId]);
    if (fail > 0) {
      fail -= 1;
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ local_id: localId, error: "not_stored" }) });
    }
    return route.continue();
  });

  // 1 · By the press: the send and the at-once resend are refused, the line
  // shows «отправить снова», the press sends it to the node.
  fail = 2;
  const first = `первая строка ${run}`;
  await anya.getByTestId("text").fill(first);
  await anya.getByTestId("send").click();
  const firstLine = anya.getByTestId("mine").filter({ hasText: first });
  await expect(firstLine).toHaveAttribute("data-state", "failed", { timeout: 10000 });
  await expect(firstLine.getByTestId("send-again")).toHaveText("отправить снова");
  await expect.poll(() => fail, { timeout: 10000 }).toBe(0);
  await firstLine.getByTestId("send-again").click();
  await expect(firstLine).toHaveAttribute("data-state", "sent", { timeout: 15000 });
  await expect(firstLine.getByTestId("send-again")).toHaveCount(0);

  // 2 · By itself: refused twice again, then the 5-second resend goes through.
  fail = 2;
  const second = `вторая строка ${run}`;
  await anya.getByTestId("text").fill(second);
  await anya.getByTestId("send").click();
  const secondLine = anya.getByTestId("mine").filter({ hasText: second });
  await expect(secondLine).toHaveAttribute("data-state", "failed", { timeout: 10000 });
  await expect(secondLine).toHaveAttribute("data-state", "sent", { timeout: 20000 });

  // One local_id per line, at least three sends each; Борис has each line once.
  const lines = [...sends.values()];
  expect(lines.length, "a resend went with a new local_id").toBe(2);
  for (const ids of lines) {
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size, `one line went under several local_ids: ${ids}`).toBe(1);
  }
  await expect(boris.getByTestId("theirs").filter({ hasText: first })).toHaveCount(1, { timeout: 20000 });
  await expect(boris.getByTestId("theirs").filter({ hasText: second })).toHaveCount(1, { timeout: 20000 });
  await a.close();
  await b.close();
});
