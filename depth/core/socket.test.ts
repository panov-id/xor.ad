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
      // Wait for the handshake: closing before it reaches the node leaves the
      // ticket unspent, and the second socket then opens honestly — the case
      // failed one run in three on exactly that race.
      await first.protocol();
      first.close();
      const again = await b.openRoomWith(ticket);
      assertEquals(await again.closedWithin(), 4001, "a ticket opened a room twice");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "the socket speaks xor.p1, and one without it is closed 4004",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Protocol §4.4 and §6: Sec-WebSocket-Protocol carries `xor.p1, ticket.<t>`;
    // the node answers xor.p1 — never the ticket — and closes 4004 when the
    // version is missing (step 5 panel, 2026-09-21).
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      assertEquals(await room.protocol(), "xor.p1", "the node did not answer with the protocol's name");
      room.close();
      const bare = await b.openRoomWith(await b.ticket(chatId), { withVersion: false });
      assertEquals(await bare.closedWithin(), 4004, "a socket without xor.p1 was not closed 4004");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "freezing a session closes its socket 4002",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Protocol §4.4: "freezing a session tears its sockets" — NOTIFY
    // session_frozen in the same transaction as frozen_at (lib/sessions.ts).
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await room.protocol();
      await sql.begin(async (tx) => {
        await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [b.sessionId]);
        await tx.unsafe(`SELECT pg_notify('session_frozen', $1)`, [b.sessionId]);
      });
      assertEquals(await room.closedWithin(), 4002, "a frozen session kept its socket (0 = still open after 5 s)");
    } finally {
      await sql.end();
    }
  },
});
