// Two terminals on one node: a mutual like, the match it makes, and consent.
//
// There is no moderator yet (§8.14), so a phrase sent through the API waits
// for a verdict nobody gives. These tests publish by writing the phrase into
// the stand's database directly — as the node's own tests do — and everything
// after that goes through the core, signed, over HTTP.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

async function person(name: string) {
  const c = new Client(node!, apiKey!);
  await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
  await c.confirmPaperCode();
  return c;
}

async function published(sql: postgres.Sql, author: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.unsafe(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 55.75, 37.62, 1000, 55.75, 37.62,
             now(), now() + interval '3 hours')`,
    [id, author, text],
  );
  return id;
}

Deno.test({
  name: "two terminals like each other, match, and both consent",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const a = await person("Женя");
      const b = await person("Аня");
      const fromA = await published(sql, a.identityId, "кто на набережную?");
      const fromB = await published(sql, b.identityId, "гуляю у реки");

      const seen = await a.feed({ lat: 55.75, lon: 37.62, radius: 1000 });
      assert((seen.items as Array<{ id: string }>).some((i) => i.id === fromB), "A's feed did not show B's phrase");

      assertEquals((await a.like(fromB)).body, { state: "liked" });
      const back = await b.like(fromA);
      assertEquals(back.body.state, "matched", `B's like back did not make a match: ${JSON.stringify(back.body)}`);
      const matchId = back.body.match_id!;

      assert((await a.inbox()).some((i) => i.id === matchId && i.kind === "match"), "the match is not in A's inbox");
      assertEquals((await a.consent(matchId)).body, { state: "waiting" });
      const agreed = (await b.consent(matchId)).body as { state: string; chat_id?: string };
      assertEquals(agreed.state, "agreed");
      assert(agreed.chat_id, "agreement opened no chat");
    } finally {
      await sql.end();
    }
  },
});
