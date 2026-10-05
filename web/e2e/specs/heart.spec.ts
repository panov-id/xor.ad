// neighbro "stickers" with one heart (owner's decision 02.10.2026): the heart
// is dragged onto the card, or tapped and then the card tapped, or picked and
// placed with Enter. The like goes the moment the heart lands, as sosed's does
// (owner's decision 04.10.2026: the 5 s window is gone); taking it back is the
// likes list's. What is read back is the network — every POST /feed/:id/like
// the page made, with its time — and the other side: the like is on the node
// at once, so her heart on his phrase makes the match straight away.
// A heart dropped outside the card goes back to the pad and sends nothing.
// sosed has no heart pad (blocks): the spec stands aside on that build.

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

type Like = { id: string; at: number };

function likes(page: Page): Like[] {
  const seen: Like[] = [];
  page.on("request", (r) => {
    const m = /^\/feed\/([^/]+)\/like$/.exec(new URL(r.url()).pathname);
    if (m && r.method() === "POST") seen.push({ id: decodeURIComponent(m[1]), at: Date.now() });
  });
  return seen;
}

async function open(page: Page, text: string): Promise<string> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("nav-feed").click();
  const card = page.getByTestId("card").filter({ hasText: text });
  await expect(card, `the phrase «${text}» is in the feed`).toHaveCount(1, { timeout: 30000 });
  const id = (await card.getAttribute("data-id"))!;
  await card.click();
  await expect(page.locator('[data-screen="card"]')).toHaveAttribute("data-id", id);
  return id;
}

// The heart carried by the mouse: pointer events, as a finger gives them.
async function carry(page: Page, to: { x: number; y: number }): Promise<void> {
  const heart = (await page.getByTestId("heart").boundingBox())!;
  await page.mouse.move(heart.x + heart.width / 2, heart.y + heart.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

test("neighbro heart: drag, tap-tap and Enter place it; the like goes at once and the other side sees it at once", async ({ browser }) => {
  test.setTimeout(240_000);
  const label = runLabel();
  const lines = ["сердце перетащить", "сердце нажатием", "сердце клавишей"].map((l) => `${l} ${label}`);
  const his = `и я тут ${label}`;
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    if ((await a.locator("html").getAttribute("data-brand")) !== "neighbro") test.skip(true, "the heart pad is neighbro's; this build is another brand");
    for (const line of lines) await writePhrase(a, line);

    const b = await (await browser.newContext()).newPage();
    contexts.push(b.context());
    const seen = likes(b);
    await register(b, { name: "Борис", age: "31" });
    // A like is a phrase meeting a phrase (§8.4): B needs a live one.
    await writePhrase(b, his);
    const screen = b.locator('[data-screen="card"]');

    // 1. Dropped outside the card: back to the pad, nothing placed or sent.
    const dragId = await open(b, lines[0]);
    await carry(b, { x: 30, y: 30 });
    await expect(screen, "a heart dropped on the header is back on the pad").toHaveAttribute("data-heart", "pad");
    expect(seen, "a heart dropped outside sent nothing").toEqual([]);

    // 2. Dragged onto the card: sent at once, once.
    const box = (await b.getByTestId("heart-target").boundingBox())!;
    const placedAt = Date.now();
    await carry(b, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(b.getByTestId("liked"), "the like went the moment the heart landed").toBeVisible({ timeout: 3000 });
    expect(seen.map((l) => l.id), "one POST /feed/:id/like, for this card").toEqual([dragId]);
    expect(seen[0].at - placedAt, "sent at once, not after a window").toBeLessThan(2000);
    await expect(screen).toHaveAttribute("data-heart", "sent");
    await expect(b.getByTestId("heart-undo"), "no undo on the card: taking back is the likes list's").toHaveCount(0);

    // The other side sees it at once: her heart on his phrase makes the match.
    await open(a, his);
    await a.getByTestId("heart").click();
    await a.getByTestId("heart-target").click();
    await expect(a.getByTestId("matched"), "his like was already on the node when hers came").toBeVisible({ timeout: 5000 });
    await b.getByTestId("back").click();

    // 3. Tap the heart, tap the card: sent at once.
    seen.length = 0;
    const tapId = await open(b, lines[1]);
    await b.getByTestId("heart").click();
    await expect(b.getByTestId("heart")).toHaveAttribute("aria-pressed", "true");
    await b.getByTestId("heart-target").click();
    await expect(b.getByTestId("liked"), "tap-tap sent the like at once").toBeVisible({ timeout: 3000 });
    expect(seen.map((l) => l.id)).toEqual([tapId]);
    await b.getByTestId("back").click();

    // 4. The keyboard: Enter picks the heart, Enter on the card sends the like.
    seen.length = 0;
    const keyId = await open(b, lines[2]);
    await b.getByTestId("heart").focus();
    await b.keyboard.press("Enter");
    await expect(b.getByTestId("heart")).toHaveAttribute("aria-pressed", "true");
    await b.getByTestId("heart-target").focus();
    await b.keyboard.press("Enter");
    await expect(b.getByTestId("liked"), "Enter sent the like at once").toBeVisible({ timeout: 3000 });
    expect(seen.map((l) => l.id)).toEqual([keyId]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
