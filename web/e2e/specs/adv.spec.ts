// The venue's cabinet end to end (A1; screen 17; offers/SPEC_RU.md §2.1, §6,
// §8, §11): a new account asks for a link, the letter arrives (read from the
// stand's Mailpit), the link opens the cabinet once; a venue is added, its
// envelope ordered, a wrong code spends an attempt, the right one — read from
// the database, since the cabinet never sees it — verifies it; an offer is
// published at once with its link, a twin of it is refused, and the list says
// it is in the feed. A reload keeps the session; the spent link does not open
// again.

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";

// The cabinet's own https service (docker-compose.web.yml web-adv).
const ADV = process.env.ADV_URL ?? "https://web-adv:4173";
const MAILPIT = process.env.MAILPIT_URL ?? "http://mailpit:8025";
const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

async function linkFromLetter(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages?: Array<{ ID: string }> };
    const id = found.messages?.[0]?.ID;
    if (id) {
      const letter = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json() as { Text?: string; HTML?: string };
      const link = /https:\/\/adv\.sosed\.place\/enter#([0-9a-f]{64})/.exec(`${letter.Text ?? ""} ${letter.HTML ?? ""}`);
      if (link) return link[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sign-in letter reached ${to}`);
}

test("the cabinet: a link by mail, a venue proved by its envelope, an offer published", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `kolos-${Date.now().toString(36)}@example.test`;
  const venueName = `Пекарня «Колос» ${Date.now().toString(36)}`;
  const text = `Второй круассан за полцены ${Date.now().toString(36)}`;

  page.on("console", (m) => console.log(`[adv ${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[adv pageerror] ${e.message}`));
  page.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/adv")) console.log(`[adv node] ${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`); });
  await page.goto(`${ADV}/adv`);
  await expect(page.locator('[data-screen="adv-sign-in"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId("adv-email").fill(email);
  await page.getByTestId("adv-contact").fill("Мария, +357 99 000000");
  await page.getByTestId("adv-send").click();
  await expect(page.getByTestId("adv-sent")).toHaveText("если адрес зарегистрирован, письмо отправлено");

  const token = await linkFromLetter(email);
  await page.goto(`${ADV}/adv/enter#${token}`);
  await expect(page.locator('[data-screen="adv-venues"]')).toBeVisible({ timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe("/adv");

  // A venue: added unverified, its envelope ordered.
  await page.getByTestId("venue-name").fill(venueName);
  await page.getByTestId("venue-address").fill("Макариу 12, Лимасол");
  // The place before the envelope (O2: a venue without one cannot publish,
  // and moving it later takes "verified" off).
  await page.getByTestId("venue-lat").fill("34.6786");
  await page.getByTestId("venue-lon").fill("33.0413");
  await page.getByTestId("venue-add").click();
  const venue = page.getByTestId("venue").filter({ hasText: venueName });
  await expect(venue.getByTestId("venue-status")).toHaveText("не подтверждена", { timeout: 15000 });
  await expect(venue.getByTestId("venue-place")).toHaveText("точка: 34.6786, 33.0413 · 1000 м");
  await venue.getByTestId("venue-envelope").click();
  await expect(venue.getByTestId("venue-code")).toBeVisible({ timeout: 15000 });

  // A wrong code spends one of five attempts.
  await venue.getByTestId("venue-code").fill("AAAAAA-AAAAAA");
  await venue.getByTestId("venue-verify").click();
  await expect(venue.getByTestId("venue-wrong")).toContainText("Осталось попыток: 4", { timeout: 15000 });

  // The right one, from the envelope the operator prints.
  const sql = postgres(DATABASE, { max: 1 });
  let code: string;
  try {
    const [row] = await sql<{ code: string }[]>`
      SELECT e.code FROM venue_envelopes e JOIN venues v ON v.id = e.venue_id
       WHERE v.name = ${venueName} AND e.used_at IS NULL AND e.burned_at IS NULL`;
    code = row.code;
  } finally {
    await sql.end();
  }
  await venue.getByTestId("venue-code").fill(code.toLowerCase().replace("-", " "));
  await venue.getByTestId("venue-verify").click();
  await expect(venue.getByTestId("venue-status")).toHaveText("подтверждена", { timeout: 15000 });

  // An offer: published at once and whole, with the node's redirect link.
  await page.getByTestId("adv-tab-offers").click();
  await page.getByTestId("offer-new").click();
  await expect(page.getByTestId("offer-venue")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("offer-text").fill(text);
  await page.getByTestId("offer-discount").fill("−20 %");
  await page.getByTestId("offer-conditions").fill("при заказе от двух");
  await page.getByTestId("offer-promo").fill("КОЛОС20");
  await page.getByTestId("offer-url").fill("https://kolos.example/");
  await page.getByTestId("offer-publish").click();
  await expect(page.getByTestId("offer-published")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("offer-published-link")).toContainText(/Ссылка: sosed\.place\/o\/\S+/);

  // The same text again: refused as a twin of a live one.
  await page.getByTestId("offer-to-list").click();
  await page.getByTestId("offer-new").click();
  await page.getByTestId("offer-text").fill(text);
  await page.getByTestId("offer-discount").fill("−20 %");
  await page.getByTestId("offer-publish").click();
  await expect(page.getByTestId("offer-refused")).toContainText("Дубль текста живого оффера", { timeout: 15000 });

  // The list: one offer, in the feed.
  await page.getByTestId("adv-tab-offers").click();
  const offer = page.getByTestId("adv-offer").filter({ hasText: text });
  await expect(offer).toHaveCount(1, { timeout: 15000 });
  await expect(offer.getByTestId("adv-offer-state")).toHaveText("в ленте");

  // A reload keeps the session; the spent link does not open again.
  await page.reload();
  await expect(page.locator('[data-screen="adv-venues"]')).toBeVisible({ timeout: 15000 });
  await page.goto(`${ADV}/adv/enter#${token}`);
  await expect(page.getByTestId("adv-expired")).toHaveText("Ссылка истекла", { timeout: 15000 });
});
