// A complaint about an offer, through the core against a live node (C1 on O2):
// a verified venue's offer comes in the feed as a card of kind offer whose id
// is the offer's; the complaint goes by that id and lands as a row. The venue
// and the offer go in as rows — the cabinet's own flow has its tests in relay.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

Deno.test({
  name: "an offer from the feed can be complained about by its card's id, with the e-mail the node reads",
  ignore: !node || !databaseUrl,
  fn: async () => {
    const sql = postgres(databaseUrl!, { max: 1 });
    const advertiser = crypto.randomUUID(), venue = crypto.randomUUID(), offer = crypto.randomUUID();
    try {
      await sql`INSERT INTO advertisers (id, email, contact) VALUES (${advertiser}, 'cafe@depth.test', 'кофейня')`;
      await sql`INSERT INTO venues (id, advertiser_id, name, address, verification_status, lat, lon, area_radius)
                VALUES (${venue}, ${advertiser}, 'Угол', 'ул. Реки 1', 'verified', 48.1, 11.6, 1000)`;
      await sql`INSERT INTO offers (id, brand, venue_id, offer_text, discount_value, redirect_code, discount_until, status, expires_at)
                VALUES (${offer}, 'sosed', ${venue}, 'кофе за полцены', '-50%', ${"d" + offer.replaceAll("-", "")},
                        now() + interval '1 day', 'active', now() + interval '1 hour')`;

      const join = async (name: string) => {
        const c = new Client(node!, apiKey!);
        await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
        await c.confirmPaperCode();
        return c;
      };
      const person = await join("Аня");
      const author = await join("Костя");
      // One commercial card per ten phrases on the page (routes/feed.ts): an
      // empty feed shows no offers at all, so ten neighbours' phrases first.
      for (let i = 0; i < 10; i++) {
        await sql.unsafe(
          `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
             lat_published, lon_published, visible_at, expires_at)
           VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 48.1, 11.6, 1000, 48.1, 11.6, now(), now() + interval '3 hours')`,
          [crypto.randomUUID(), author.identityId, `фраза ${i}`],
        );
      }
      const feed = await person.feed({ lat: 48.1, lon: 11.6, radius: 1000 });
      const card = (feed.items as Array<{ kind?: string; id: string }>).find((i) => i.kind === "offer");
      assert(card, `no offer card in the feed: ${JSON.stringify(feed.items)}`);
      assertEquals(card.id, offer, "the offer card's id is not the offer's");

      const sent = await person.complain(card.id, "ann@example.org", "скидку не дали");
      assertEquals(sent.status, 202, JSON.stringify(sent.body));
      const [row] = await sql`SELECT notifier_email, text FROM offer_complaints WHERE offer_id = ${offer}`;
      assertEquals([row?.notifier_email, row?.text], ["ann@example.org", "скидку не дали"], "the complaint did not land as a row");
    } finally {
      await sql`DELETE FROM offers WHERE id = ${offer}`;
      await sql`DELETE FROM venues WHERE id = ${venue}`;
      await sql`DELETE FROM advertisers WHERE id = ${advertiser}`;
      await sql.end();
    }
  },
});
