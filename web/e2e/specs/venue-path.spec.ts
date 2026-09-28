// A venue's path end to end, with nothing written into the database but what
// the operator prints (Q2, wave 6): the cabinet signs in by mail, adds a venue
// at the page's own spot, proves it by its envelope and publishes an offer; a
// neighbour registers, finds that offer in the feed, follows its link to the
// exit screen and back, and complains from the card; the complaint reaches the
// venue's cabinet. The moderator's decision in the panel is the next step,
// once the web stand carries the panel (R2).

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

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

test("a venue's path: cabinet, envelope, offer, the neighbour's feed, its link, a complaint back in the cabinet", async ({ browser, page }) => {
  test.setTimeout(180_000);
  const stamp = runLabel();
  const email = `path-${stamp}@example.test`;
  const venueName = `Кофейня «Путь» ${stamp}`;
  const text = `Третий кофе даром ${stamp}`;
  const said = `Кассир сказал, что акции нет ${stamp}`;

  // The cabinet, in its own context: its origin is web-adv, not the storefront.
  const cabinet = await browser.newContext({ ignoreHTTPSErrors: true });
  const adv = await cabinet.newPage();
  await adv.goto(`${ADV}/adv`);
  await expect(adv.locator('[data-screen="adv-sign-in"]')).toBeVisible({ timeout: 15000 });
  await adv.getByTestId("adv-email").fill(email);
  await adv.getByTestId("adv-contact").fill("Лена, +357 99 111111");
  await adv.getByTestId("adv-send").click();
  await expect(adv.getByTestId("adv-sent")).toBeVisible();
  await adv.goto(`${ADV}/adv/enter#${await linkFromLetter(email)}`);
  await expect(adv.locator('[data-screen="adv-venues"]')).toBeVisible({ timeout: 15000 });

  // At the page's own spot (App.tsx: 41.9, 12.5), so the neighbour is inside its circle.
  await adv.getByTestId("venue-name").fill(venueName);
  await adv.getByTestId("venue-address").fill("Анексартисиас 7");
  await adv.getByTestId("venue-lat").fill("41.9");
  await adv.getByTestId("venue-lon").fill("12.5");
  await adv.getByTestId("venue-add").click();
  const venue = adv.getByTestId("venue").filter({ hasText: venueName });
  await expect(venue.getByTestId("venue-status")).toHaveText("не подтверждена", { timeout: 15000 });
  await venue.getByTestId("venue-envelope").click();
  await expect(venue.getByTestId("venue-code")).toBeVisible({ timeout: 15000 });
  // The envelope's code is what the operator prints; the cabinet never sees it.
  const sql = postgres(DATABASE, { max: 1 });
  let code: string;
  try {
    [{ code }] = await sql<{ code: string }[]>`
      SELECT e.code FROM venue_envelopes e JOIN venues v ON v.id = e.venue_id
       WHERE v.name = ${venueName} AND e.used_at IS NULL AND e.burned_at IS NULL`;
  } finally {
    await sql.end();
  }
  await venue.getByTestId("venue-code").fill(code);
  await venue.getByTestId("venue-verify").click();
  await expect(venue.getByTestId("venue-status")).toHaveText("подтверждена", { timeout: 15000 });

  await adv.getByTestId("adv-tab-offers").click();
  await adv.getByTestId("offer-new").click();
  await expect(adv.getByTestId("offer-venue")).toBeVisible({ timeout: 15000 });
  await adv.getByTestId("offer-text").fill(text);
  await adv.getByTestId("offer-discount").fill("−30 %");
  await adv.getByTestId("offer-url").fill("https://put.example/menu");
  await adv.getByTestId("offer-preview").click();
  await adv.getByTestId("offer-publish").click();
  await expect(adv.getByTestId("offer-published")).toBeVisible({ timeout: 15000 });
  const published = await adv.getByTestId("offer-published-link").textContent() ?? "";
  const redirect = /sosed\.place\/o\/(\S+)/.exec(published)?.[1];
  expect(redirect, `the cabinet shows the offer's link, got "${published}"`).toBeTruthy();

  // The feed carries one offer per ten phrases, none below ten (routes/feed.ts,
  // offers spec §7), and a person gets four an hour (feed_limits.ts): three
  // neighbours write ten, by the screen, so the offer has a slot.
  const lines = ["кто на пляж", "ищу компанию на ужин", "есть кто в парке", "где тут хороший кофе",
    "кто бегает по утрам", "потерялся кот рыжий", "ищу партнёра по теннису", "кто знает мастера",
    "продаю велосипед", "сегодня ветрено"];
  for (let i = 0; i < 3; i++) {
    const author = await (await browser.newContext()).newPage();
    await register(author, { name: ["Вера", "Глеб", "Дина"][i], age: "30" });
    for (const line of lines.slice(i * 4, i * 4 + 4)) await writePhrase(author, `${line} ${stamp}`);
    await author.context().close();
  }

  // The neighbour: the offer is in the feed, as the cabinet published it.
  await register(page);
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  const card = page.getByTestId("card").filter({ hasText: text });
  await expect(card, "the cabinet's offer reached the neighbour's feed").toHaveCount(1, { timeout: 30000 });

  // Its link: the exit screen names the domain the venue gave.
  const exit = await page.context().newPage();
  await exit.goto(`/o/${redirect}`);
  await expect(exit.locator('[data-screen="offer-exit"]')).toHaveAttribute("data-state", "ok", { timeout: 15000 });
  await expect(exit.getByTestId("domain")).toHaveText("put.example");
  await exit.close();

  // Back on the card: "скидку не дали", with an address.
  const sent: number[] = [];
  page.on("response", (r) => { if (/^\/offers\/[^/]+\/complaints$/.test(new URL(r.url()).pathname)) sent.push(r.status()); });
  await card.click();
  await page.getByTestId("complain").click();
  await page.getByTestId("complain-email").fill("sosed@example.test");
  await page.getByTestId("complain-text").fill(said);
  await page.getByTestId("complain-send").click();
  await expect(page.getByTestId("complained"), "the node took the neighbour's complaint on the venue's offer").toBeVisible({ timeout: 15000 });
  expect(sent).toEqual([202]);

  // The cabinet sees it, waiting for the venue's answer.
  await adv.getByTestId("adv-tab-venues").click();
  await adv.getByTestId("adv-tab-offers").click();
  const offer = adv.getByTestId("adv-offer").filter({ hasText: text });
  await expect(offer.getByTestId("adv-offer-complaints"), "the neighbour's complaint reached the cabinet").toContainText("1", { timeout: 15000 });
  const complaint = adv.getByTestId("adv-complaint").filter({ hasText: said });
  await expect(complaint).toContainText("ждёт вашего ответа");
  await cabinet.close();
});
