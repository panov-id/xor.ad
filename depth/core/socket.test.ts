// The chat's room: a ticket, a socket, and a message handed over (§8.8, protocol
// §4.4). Two terminals on one live node; the phrases are published straight into
// the stand's database, as in match.test.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

async function chatBetween(sql: postgres.Sql) {
  const person = async (name: string) => {
    const c = new Client(node!, apiKey!);
    await c.register({ name, age: 30 }, { testOnly: true });
    await c.confirmPaperCode();
    return c;
  };
  const a = await person("Женя");
  const b = await person("Аня");
  const put = async (who: string, text: string) => {
    const id = crypto.randomUUID();
    await sql.unsafe(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '3 hours')`,
      [id, who, text]);
    return id;
  };
  const pa = await put(a.identityId, "кто на набережную?");
  const pb = await put(b.identityId, "гуляю у реки");
  await a.like(pb);
  const matchId = (await b.like(pa)).body.match_id!;
  await a.consent(matchId);
  const chatId = (await b.consent(matchId)).body.chat_id!;
  return { a, b, chatId };
}

const seal = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

Deno.test({
  name: "a message reaches the other terminal over its socket, including one sent before it connected",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const early = seal();
      const earlyId = crypto.randomUUID();
      assertEquals((await a.sendMessage(chatId, earlyId, early)).status, 202);

      const room = await b.openRoom(chatId);
      const first = await room.next();
      assertEquals(first.type, "message", "the socket did not hand over the queued message");
      assertEquals((first.data as { id: string; ciphertext: string }).ciphertext, early);

      const live = seal();
      await a.sendMessage(chatId, crypto.randomUUID(), live);
      const second = await room.next();
      assertEquals((second.data as { ciphertext: string }).ciphertext, live, "a live message did not arrive");
      assert(second.seq > first.seq, "seq did not grow on the socket");
      room.close();
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a spent ticket does not open a room",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { b, chatId } = await chatBetween(sql);
      const ticket = await b.ticket(chatId);
      const first = await b.openRoomWith(ticket);
      first.close();
      const again = await b.openRoomWith(ticket);
      assertEquals(await again.closed, 4001, "a ticket opened a room twice");
    } finally {
      await sql.end();
    }
  },
});
