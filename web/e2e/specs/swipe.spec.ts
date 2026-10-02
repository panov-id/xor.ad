// sosed "blocks" (owner's decision 02.10.2026): the full-screen card answers
// three gestures, and each has its button. Swipe right likes, swipe left
// hides, pull down opens the details; the like button, the eye and ↓ do the
// same. What is read back is the node's answer — POST /feed/:id/like and
// POST /hidden {feed: id} by their statuses — as well as the screen. A swipe
// short of the threshold snaps back and sends nothing.
// neighbro has no swipes (stickers): the spec stands aside on that build.

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

// A like is POST /feed/:id/like; a hide is POST /hidden with {feed: id}.
type Call = { what: "like" | "hide"; id: string; status: number };

function calls(page: Page): Call[] {
  const seen: Call[] = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    const like = /^\/feed\/([^/]+)\/like$/.exec(path);
    if (like && r.request().method() === "POST") seen.push({ what: "like", id: decodeURIComponent(like[1]), status: r.status() });
    if (path === "/hidden" && r.request().method() === "POST") {
      seen.push({ what: "hide", id: (JSON.parse(r.request().postData() ?? "{}") as { feed?: string }).feed ?? "", status: r.status() });
    }
  });
  return seen;
}
const said = (seen: Call[]) => seen.map((c) => `${c.what} ${c.id} ${c.status}`);

async function open(page: Page, text: string): Promise<string> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("nav-feed").click();
  const card = page.getByTestId("card").filter({ hasText: text });
  await expect(card, `the phrase «${text}» is in B's feed`).toHaveCount(1, { timeout: 30000 });
  const id = (await card.getAttribute("data-id"))!;
  await card.click();
  await expect(page.locator('[data-screen="card"]')).toHaveAttribute("data-id", id);
  return id;
}

// A drag on the card with the mouse: pointer events, as a finger gives them.
async function drag(page: Page, dx: number, dy: number): Promise<void> {
  const box = (await page.getByTestId("swipe-card").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test("sosed card: swipe right likes, swipe left hides, pull down opens details — and the buttons do the same", async ({ browser }) => {
  test.setTimeout(180_000);
  const label = runLabel();
  const lines = ["свайп вправо", "свайп влево", "кнопка нравится", "кнопка скрыть"].map((l) => `${l} ${label}`);
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    if ((await a.locator("html").getAttribute("data-brand")) !== "sosed") test.skip(true, "swipes are sosed's; this build is another brand");
    for (const line of lines) await writePhrase(a, line);

    const b = await (await browser.newContext()).newPage();
    contexts.push(b.context());
    const seen = calls(b);
    await register(b, { name: "Борис", age: "31" });
    // A like is a phrase meeting a phrase (§8.4): B needs a live one.
    await writePhrase(b, `и я тут ${label}`);

    // A short swipe snaps back and sends nothing.
    const rightId = await open(b, lines[0]);
    await drag(b, 40, 0);
    await b.waitForTimeout(500);
    expect(seen, "a swipe of 40 px, under the 96 threshold, sent nothing").toEqual([]);
    await expect(b.getByTestId("liked")).toHaveCount(0);

    // Swipe right: the like.
    await drag(b, 160, 8);
    await expect(b.getByTestId("liked"), "swipe right gave a like").toBeVisible({ timeout: 15000 });
    expect(said(seen), "swipe right is POST /feed/:id/like → 200").toEqual([`like ${rightId} 200`]);
    await expect(b.getByTestId("like")).toBeDisabled();

    // Pull down: the details; ↑ closes them.
    await expect(b.getByTestId("details")).toHaveCount(0);
    await drag(b, 0, 120);
    await expect(b.getByTestId("details"), "pull down opened the details").toBeVisible();
    await b.getByTestId("peek").click();
    await expect(b.getByTestId("details"), "the ↑ button closed them").toHaveCount(0);
    await b.getByTestId("peek").click();
    await expect(b.getByTestId("details"), "the ↓ button opens them as the pull does").toBeVisible();
    await b.getByTestId("back").click();

    // Swipe left: hidden, and the card leaves the feed with a word.
    seen.length = 0;
    const leftId = await open(b, lines[1]);
    await drag(b, -160, 0);
    await expect(b.getByTestId("gone"), "swipe left hid the phrase").toHaveAttribute("data-why", "hidden", { timeout: 15000 });
    expect(said(seen), "swipe left is POST /hidden {feed: id} → 200").toEqual([`hide ${leftId} 200`]);
    await expect(b.getByTestId("card").filter({ hasText: lines[1] })).toHaveCount(0);

    // The like button.
    seen.length = 0;
    const likeId = await open(b, lines[2]);
    await b.getByTestId("like").click();
    await expect(b.getByTestId("liked"), "the like button gave a like").toBeVisible({ timeout: 15000 });
    expect(said(seen), "the like button is the same call").toEqual([`like ${likeId} 200`]);
    await b.getByTestId("back").click();

    // The eye.
    seen.length = 0;
    const hideId = await open(b, lines[3]);
    await b.getByTestId("hide").click();
    await expect(b.getByTestId("gone"), "the eye hid the phrase").toHaveAttribute("data-why", "hidden", { timeout: 15000 });
    expect(said(seen), "the eye is the same call").toEqual([`hide ${hideId} 200`]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
