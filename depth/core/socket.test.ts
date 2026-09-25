// The chat's room: a ticket, a socket, and a message handed over (§8.8, protocol
// §4.4). Two terminals on one live node; the phrases are published straight into
// the stand's database, as in match.test.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
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
      const { id: frameId, ciphertext: box } = frame.data as { id: string; ciphertext: string };
      assert(!box.includes("моста"), "the text travelled in the clear");
      assertEquals(await b.read(chatId, box, frameId), "встретимся у моста в семь");
      // What the node holds is the box, not the text.
      const [row] = await sql.unsafe(`SELECT ciphertext FROM pending_deliveries WHERE chat_id = $1 LIMIT 1`, [chatId]).catch(() => []);
      if (row) assert(!String(row.ciphertext).includes("моста"));
      // The sender cannot read their own box as incoming: two keys, not one (§8.13).
      let reflected = false;
      try { await a.read(chatId, box, frameId, matchId); reflected = true; } catch { /* expected */ }
      assert(!reflected, "a reflected message opened on the sender's side");
      // Back the other way.
      const aRoom = await a.openRoom(chatId);
      await b.sayInChat(chatId, "иду");
      const back = await aRoom.next();
      const backData = back.data as { id: string; ciphertext: string };
      assertEquals(await a.read(chatId, backData.ciphertext, backData.id), "иду");
      room.close();
      aRoom.close();
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a terminal that lost its keys gets new ones from the other side, and old boxes stay shut",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId, matchId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await a.sayInChat(chatId, "до потери", matchId);
      const before = (await room.next()).data as { id: string; ciphertext: string };
      assertEquals(await b.read(chatId, before.ciphertext, before.id), "до потери");

      // The pair is gone — a new device, a restart — and nothing opens.
      a.forget(chatId);
      let sealed = false;
      try { await a.sayInChat(chatId, "без ключей"); sealed = true; } catch { /* expected */ }
      assert(!sealed, "a terminal without its pair sealed a message");

      // Ask, and the other side agrees (§8.13: the human is asked there; the
      // terminal's own screen for that question is not built).
      assertEquals((await a.requestRekey(chatId)).body, { state: "waiting", epoch: 1 });
      assert(await b.rekeyRequested(chatId), "b was not told keys are being reissued");
      assertEquals((await b.acceptRekey(chatId)).body, { state: "agreed", epoch: 1 });

      await a.sayInChat(chatId, "после перевыпуска");
      // The reissue itself arrives as frames too (type "rekey"); the message is after them.
      let next = await room.next();
      while (next.type === "rekey") next = await room.next();
      assertEquals(next.type, "message");
      const after = next.data as { id: string; ciphertext: string };
      assertEquals(await b.read(chatId, after.ciphertext, after.id), "после перевыпуска");
      // The old box does not open under the new keys: nothing restores the old K.
      let reopened = false;
      try { await b.read(chatId, before.ciphertext, before.id); reopened = true; } catch { /* expected */ }
      assert(!reopened, "a box from before the reissue opened under the new keys");
      room.close();
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a node cannot roll a chat back to an old half, nor fake a request for new keys",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId, matchId } = await chatBetween(sql);
      await a.sayInChat(chatId, "эпоха 0", matchId);
      // The consent halves, as the node holds them, before any reissue.
      const epoch0 = await sql.unsafe(
        `SELECT identity, ephemeral_public_key, ephemeral_signature FROM chat_participants WHERE chat_id = $1`, [chatId]);

      // Faked request: the node sets a's row to epoch 1 with a's epoch-0 half,
      // which is signed for consent, not for (chat, 1). b must not agree.
      await sql.unsafe(`UPDATE chat_participants SET key_epoch = 1 WHERE chat_id = $1 AND identity = $2`, [chatId, a.identityId]);
      let agreed = false;
      try { await b.acceptRekey(chatId); agreed = true; } catch { /* expected */ }
      assert(!agreed, "b agreed to a request for new keys the other side never signed");
      await sql.unsafe(`UPDATE chat_participants SET key_epoch = 0 WHERE chat_id = $1 AND identity = $2`, [chatId, a.identityId]);

      // A real reissue to epoch 1.
      a.forget(chatId);
      await a.requestRekey(chatId);
      await b.acceptRekey(chatId);
      await a.sayInChat(chatId, "эпоха 1");

      // Rollback: the node puts both rows back to epoch 0 with the genuine
      // consent halves — signatures that verify. The clients must refuse: they
      // know they published at epoch 1.
      for (const row of epoch0) {
        await sql.unsafe(
          `UPDATE chat_participants SET key_epoch = 0, ephemeral_public_key = $3, ephemeral_signature = $4
            WHERE chat_id = $1 AND identity = $2`,
          [chatId, row.identity, row.ephemeral_public_key, row.ephemeral_signature]);
      }
      let rolledBack = false;
      try { await a.sayInChat(chatId, "после отката"); rolledBack = true; } catch { /* expected */ }
      assert(!rolledBack, "a sealed under a half the node rolled back to");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "an open room hears that the other side asked for new keys",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await room.protocol();
      a.forget(chatId);
      await a.requestRekey(chatId);
      const heard = await room.next();
      assertEquals(heard.type, "rekey", "the open room was not told about the request");
      assertEquals((heard.data as { epoch: number }).epoch, 1);
      room.close();
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a changed age reaches the open room as a sys frame with the number, and no text",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const room = await b.openRoom(chatId);
      await room.protocol();
      const edited = await a.editProfile({ age: 31 });
      assertEquals(edited.status, 200, JSON.stringify(edited.body));
      const heard = await room.next();
      assertEquals(heard.type, "sys", "the open room did not hear the change");
      assertEquals(heard.data, { kind: "age_changed", age: 31 });
      // The same age again is not a change: nothing is sent.
      await a.editProfile({ age: 31 });
      let extra = false;
      try { await room.next(400); extra = true; } catch { /* nothing came: right */ }
      assert(!extra, "an unchanged age sent a frame");
      room.close();
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "both terminals see one safety code, bound to the conversation they opened",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId, matchId } = await chatBetween(sql);
      const mine = (await a.openConversation(chatId, matchId)).safetyCode;
      const theirs = (await b.openConversation(chatId, matchId)).safetyCode;
      assertEquals(mine, theirs, "the two sides of one conversation see different codes");
      assert(/^\d{4} \d{4} \d{4} \d{4} \d{4}$/.test(mine), `not a safety code: ${mine}`);
    } finally {
      await sql.end();
    }
  },
});

// Stepping away (§8.2): the other side's open room hears it as a sys line with
// no trace of who else is listening; one's own open room hears nothing — it is
// not news to oneself (review panel 23.09.2026).
Deno.test({
  name: "a step away reaches the other side's room, and not one's own",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, chatId } = await chatBetween(sql);
      const theirs = await b.openRoom(chatId);
      const mine = await a.openRoom(chatId);
      await theirs.protocol();
      await mine.protocol();
      await a.stepAway("short");
      const heard = await theirs.next();
      assertEquals(heard.type, "sys", "the other side's room did not hear the step away");
      assertEquals(heard.data, { kind: "peer_stepped_away" }, "the line carried more than its kind");
      let own = false;
      try { await mine.next(400); own = true; } catch { /* nothing came: right */ }
      assert(!own, "one's own room was told its own person stepped away");
      theirs.close();
      mine.close();
    } finally {
      await sql.end();
    }
  },
});
