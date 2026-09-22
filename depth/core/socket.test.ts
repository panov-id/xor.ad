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
  return { a, b, chatId, matchId };
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

Deno.test({
  name: "closing the conversation closes the other one's room 4003",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Protocol §4.4: 4003 — the conversation is over; the client does not
    // reconnect and shows the tombstone.
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await room.protocol();
      assertEquals((await a.closeChat(chatId)).status, 200);
      assertEquals(await room.closedWithin(), 4003, "the room outlived its conversation (0 = still open after 5 s)");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "blocking closes the other one's room at once, 4003",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // §8.9: a block ends the shared conversation for both — not on the blocked
    // one's next request, but now (step 5 panel, task 5).
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await room.protocol();
      assertEquals((await a.blockByChat(chatId)).status, 204);
      assertEquals(await room.closedWithin(), 4003, "the blocked one's room stayed open (0 = still open after 5 s)");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "two terminals talk in ciphertext: the peer reads it, the node's row does not, a reflection does not open",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId, matchId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      // a consented first ("waiting"), so its pair still sits under the match.
      const sent = await a.sayInChat(chatId, "встретимся у моста в семь", matchId);
      assertEquals(sent.status, 202, JSON.stringify(sent.body));
      const frame = await room.next();
      assertEquals(frame.type, "message");
      const box = (frame.data as { ciphertext: string }).ciphertext;
      assert(!box.includes("моста"), "the text travelled in the clear");
      assertEquals(await b.read(chatId, box), "встретимся у моста в семь");
      // What the node holds is the box, not the text.
      const [row] = await sql.unsafe(`SELECT ciphertext FROM pending_deliveries WHERE chat_id = $1 LIMIT 1`, [chatId]).catch(() => []);
      if (row) assert(!String(row.ciphertext).includes("моста"));
      // The sender cannot read their own box as incoming: two keys, not one (§8.13).
      let reflected = false;
      try { await a.read(chatId, box, matchId); reflected = true; } catch { /* expected */ }
      assert(!reflected, "a reflected message opened on the sender's side");
      // Back the other way.
      const aRoom = await a.openRoom(chatId);
      await b.sayInChat(chatId, "иду");
      const back = await aRoom.next();
      assertEquals(await a.read(chatId, (back.data as { ciphertext: string }).ciphertext), "иду");
      room.close();
      aRoom.close();
    } finally {
      await sql.end();
    }
  },
});
