// neighbro "stickers" with one heart (owner's decision 02.10.2026): the heart
// is dragged onto the card, or tapped and then the card tapped, or picked and
// placed with Enter. It sits there 5 s before the like goes; taken off in
// that window, nothing goes. What is read back is the network: every
// POST /feed/:id/like the page made, with its time. A heart dropped outside
// the card goes back to the pad and sends nothing.
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
  await expect(card, `the phrase «${text}» is in B's feed`).toHaveCount(1, { timeout: 30000 });
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

test("neighbro heart: drag, tap-tap and Enter place it; the like goes after 5 s; undo inside 5 s sends nothing", async ({ browser }) => {
  test.setTimeout(240_000);
  const label = runLabel();
  const lines = ["сердце перетащить", "сердце снять", "сердце клавишей", "сердце и скрыть", "сердце и блок"].map((l) => `${l} ${label}`);
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    if ((await a.locator("html").getAttribute("data-brand")) !== "neighbro") test.skip(true, "the heart pad is neighbro's; this build is another brand");
    for (const line of lines.slice(0, 3)) await writePhrase(a, line);
    // Four live phrases is a person's ceiling (feed_limits.ts): the hide and
    // block cases get their own author, who is also the one blocked.
    const c = await (await browser.newContext()).newPage();
    contexts.push(c.context());
    await register(c, { name: "Вера", age: "35" });
    for (const line of lines.slice(3)) await writePhrase(c, line);

    const b = await (await browser.newContext()).newPage();
    contexts.push(b.context());
    const seen = likes(b);
    await register(b, { name: "Борис", age: "31" });
    // A like is a phrase meeting a phrase (§8.4): B needs a live one.
    await writePhrase(b, `и я тут ${label}`);
    const screen = b.locator('[data-screen="card"]');

    // 1. Dropped outside the card: back to the pad, nothing placed or sent.
    const dragId = await open(b, lines[0]);
    await carry(b, { x: 30, y: 30 });
    await expect(screen, "a heart dropped on the header is back on the pad").toHaveAttribute("data-heart", "pad");
    await expect(b.getByTestId("heart-wait")).toHaveCount(0);

    // 2. Dragged onto the card: placed, held 5 s, then sent once.
    const box = (await b.getByTestId("heart-target").boundingBox())!;
    await carry(b, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const placedAt = Date.now();
    await expect(screen, "the dragged heart sits on the card").toHaveAttribute("data-heart", "pending");
    await expect(b.getByTestId("heart-wait")).toBeVisible();
    await b.waitForTimeout(3000);
    expect(seen, "three seconds in, the like has not gone").toEqual([]);
    await expect(b.getByTestId("liked"), "the like went after the window").toBeVisible({ timeout: 15000 });
    expect(seen.map((l) => l.id), "one POST /feed/:id/like, for this card").toEqual([dragId]);
    expect(seen[0].at - placedAt, "not before 5 s").toBeGreaterThanOrEqual(4900);
    await expect(screen).toHaveAttribute("data-heart", "sent");
    await b.getByTestId("back").click();

    // 3. Tap the heart, tap the card; take it off inside 5 s: nothing goes.
    seen.length = 0;
    await open(b, lines[1]);
    await b.getByTestId("heart").click();
    await expect(b.getByTestId("heart")).toHaveAttribute("aria-pressed", "true");
    await b.getByTestId("heart-target").click();
    await expect(screen, "tap-tap placed the heart").toHaveAttribute("data-heart", "pending");
    await b.waitForTimeout(2000);
    await b.getByTestId("heart-undo").click();
    await expect(screen, "undo took the heart back to the pad").toHaveAttribute("data-heart", "pad");
    await b.waitForTimeout(6000);
    expect(seen, "undone inside the window: no POST /feed/:id/like at all").toEqual([]);
    await expect(b.getByTestId("liked")).toHaveCount(0);
    await b.getByTestId("back").click();

    // 4. The keyboard: Enter picks the heart, Enter on the card places it.
    seen.length = 0;
    const keyId = await open(b, lines[2]);
    await b.getByTestId("heart").focus();
    await b.keyboard.press("Enter");
    await expect(b.getByTestId("heart")).toHaveAttribute("aria-pressed", "true");
    await b.getByTestId("heart-target").focus();
    await b.keyboard.press("Enter");
    await expect(screen, "Enter placed the heart").toHaveAttribute("data-heart", "pending");
    await expect(b.getByTestId("liked")).toBeVisible({ timeout: 15000 });
    expect(seen.map((l) => l.id)).toEqual([keyId]);
    await b.getByTestId("back").click();

    // 5–6. Hiding or blocking inside the window takes the heart off: leaving
    // the card must not send the like the person was walking away from.
    for (const [line, why] of [[lines[3], "hidden"], [lines[4], "blocked"]] as const) {
      seen.length = 0;
      await open(b, line);
      await b.getByTestId("heart").click();
      await b.getByTestId("heart-target").click();
      await expect(screen).toHaveAttribute("data-heart", "pending");
      if (why === "hidden") await b.getByTestId("hide").click();
      else {
        await b.getByTestId("block").click();
        await b.getByTestId("block-confirm-yes").click();
      }
      await expect(b.getByTestId("gone")).toHaveAttribute("data-why", why);
      await b.waitForTimeout(6000);
      expect(seen, `${why} inside the window: no POST /feed/:id/like`).toEqual([]);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
