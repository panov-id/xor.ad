// The chats list's room (protocol §4.4, chat spec §8.12): one socket per session, a «changed» frame as it opens
// and again when the other side opens the chat. Run through scripts/run-depth-tests.sh against a live node.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client, type Room } from "./client.ts";
import { newPaperCode } from "./paper.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

async function chatBetween(sql: postgres.Sql) {
  const person = async (name: string) => {
    const c = new Client(node!, apiKey!);
    await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
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
  return { a, b, chatId, matchId };
}

Deno.test({
  name: "the chats list's room hears the chat the other side opens",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const person = async (name: string) => {
        const c = new Client(node!, apiKey!);
        await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
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
      const pa = await put(a.identityId, "кто в парк?");
      const pb = await put(b.identityId, "иду в парк");
      await a.like(pb);
      const matchId = (await b.like(pa)).body.match_id!;
      await a.consent(matchId);
      const room: Room = await a.openInbox();
      const opened = await room.next();
      assertEquals(opened.type, "inbox", "the room opened without its first «changed»");
      assertEquals(opened.data, {}, "the frame carries what changed; it must carry nothing");
      const chatId = (await b.consent(matchId)).body.chat_id;
      assert(chatId, "the consents opened no chat");
      const heard = await room.next();
      assertEquals(heard.type, "inbox", "the chat opened and the list's room heard nothing");
      room.close();
    } finally {
      await sql.end();
    }
  },
});
