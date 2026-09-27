// A complaint on a venue's offer (W12; offers spec §3, §10.2): a live offer of
// a verified venue with a place is in the neighbour's feed as kind "offer";
// "скидку не дали" asks an address and what happened, and the node takes it
// (202). The offer is written straight into the stand's database — the
// cabinet's own path to it is adv.spec.ts; this spec is about the card.

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

test("a venue's offer in the feed takes a complaint with an address, and the node accepts it", async ({ page }) => {
  test.setTimeout(120_000);
  const text = `Второй кофе бесплатно ${Date.now().toString(36)}`;
  const sql = postgres(DATABASE, { max: 1 });
  let offerId: string;
  try {
    const [adv] = await sql<{ id: string }[]>`
      INSERT INTO advertisers (id, email, contact, brand) VALUES (gen_random_uuid(), ${`ugol-${Date.now()}@example.test`}, 'Ника', 'sosed')
      RETURNING id`;
    // At the page's own spot (App.tsx: 41.9, 12.5), verified, with its circle.
    const [venue] = await sql<{ id: string }[]>`
      INSERT INTO venues (id, advertiser_id, name, address, verification_status, verified_at, lat, lon, area_radius)
      VALUES (gen_random_uuid(), ${adv.id}, 'Кофейня «Угол»', 'Анексартисиас 3', 'verified', now(), 41.9, 12.5, 1000)
      RETURNING id`;
    const [offer] = await sql<{ id: string }[]>`
      INSERT INTO offers (id, brand, venue_id, offer_text, discount_value, redirect_code, discount_until, status, expires_at)
      VALUES (gen_random_uuid(), 'sosed', ${venue.id}, ${text}, '−10 %', ${Date.now().toString(36)}, now() + interval '7 days', 'active',
              now() + interval '260 minutes')
      RETURNING id`;
    offerId = offer.id;
  } finally {
    await sql.end();
  }

  const sent: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === `/offers/${offerId}/complaints`) sent.push(r.status()); });
  await register(page);
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  const card = page.getByTestId("card").filter({ hasText: text });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await card.click();
  await expect(page.locator('[data-screen="card"]')).toHaveAttribute("data-id", offerId);

  await page.getByTestId("complain").click();
  await expect(page.getByTestId("complain-send")).toBeDisabled();
  await page.getByTestId("complain-email").fill("sosed@example.test");
  await page.getByTestId("complain-text").fill("Сказали, что акция только по будням.");
  await page.getByTestId("complain-send").click();
  await expect(page.getByTestId("complained")).toHaveText("Жалоба отправлена. Решение придёт на почту.", { timeout: 15000 });
  expect(sent).toEqual([202]);
});
