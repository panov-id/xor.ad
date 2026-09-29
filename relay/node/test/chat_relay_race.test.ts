// A room opened for a conversation whose end came a moment earlier (R4b,
// T4b). The ticket is spent in relayUpgrade, the room joins the registry only
// in socket.onopen; a `NOTIFY chat_closed` that lands between the two finds no
// room to close, and the room of an ended conversation lived on — no 4003, no
// tombstone ("the one watching is not shown the end", decline-expire on
// 8077848f, 2026-09-28). The window is held open here on purpose: the server
// sweeps between the spent ticket and the handshake.

import { assertEquals } from "jsr:@std/assert@1";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const relay = await import("../src/chat/relay.ts");
const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
const { sha256hex } = await import("../src/lib/identity_auth.ts");

// Warmed before the first case: a pool connection or a listener opened inside
// a case is a leak by Deno's reckoning (session_freeze.test.ts).
await database.queryOrThrow("SELECT 1");
await relay.listenForRooms();
addEventListener("unload", () => {
  database.closePool();
});

// One person in a conversation of their own, its term already passed, and a
// ticket for it.
async function endedChatWithTicket(): Promise<{ chatId: string; token: string }> {
  const identityId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const chatId = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
       VALUES ($1, 'race-suite', 30, 'not-a-real-key', now())`,
    [identityId],
  );
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key)
       VALUES ($1, $2, 'not-a-real-key', 'not-a-real-key')`,
    [sessionId, identityId],
  );
  await database.queryOrThrow(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [chatId, `race-${chatId}`]);
  await database.queryOrThrow(
    `INSERT INTO chat_participants (chat_id, identity, idle_ttl_minutes, last_own_message_at)
       VALUES ($1, $2, 10, now() - interval '11 minutes')`,
    [chatId, identityId],
  );
  const token = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO socket_tickets (token_hash, session, chat, expires_at) VALUES ($1, $2, $3, now() + interval '30 seconds')`,
    [await sha256hex(new TextEncoder().encode(token)), sessionId, chatId],
  );
  return { chatId, token };
}

// The code the conversation's socket ends with: the `closed` frame's when the
// node sent one (a 4003 may reach a client as a bare 1006), else the socket's.
function endOf(port: number, token: string, ms: number): Promise<number | "open"> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, ["xor.p1", `ticket.${token}`]);
    let announced: number | null = null;
    const late = setTimeout(() => {
      socket.close();
      resolve("open");
    }, ms);
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data));
      if (frame.type === "closed") announced = frame.data.code;
    };
    socket.onclose = (event) => {
      clearTimeout(late);
      resolve(announced ?? event.code);
    };
    socket.onerror = () => {};
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

Deno.test("a conversation that ended between the spent ticket and the open socket closes it 4003", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const { chatId, token } = await endedChatWithTicket();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const response = await relay.relayUpgrade(req);
    // The ticket is spent; the handshake has not finished. The sweeper ends
    // the conversation now, and its NOTIFY is heard before the socket opens.
    await sweepChats();
    const [row] = await database.queryOrThrow<{ gone: boolean }>(
      `SELECT gone_at IS NOT NULL AS gone FROM chat_participants WHERE chat_id = $1`, [chatId]);
    assertEquals(row.gone, true, "the sweeper did not end the conversation — the case proves nothing");
    await settle();
    return response;
  });
  try {
    assertEquals(await endOf(server.addr.port, token, 3000), 4003,
      "a room of an ended conversation stayed open: the end was announced before the room was listed");
  } finally {
    await server.shutdown();
    relay.roomsForTest().delete(chatId);
  }
});

// Positive control: the same socket and the same sweep, the sweep after the
// room is listed — the 4003 the case above waits for does reach this client.
Deno.test("a conversation that ends while its socket is open closes it 4003", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const { chatId, token } = await endedChatWithTicket();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  try {
    const end = endOf(server.addr.port, token, 3000);
    const until = Date.now() + 2000;
    while (Date.now() < until && !relay.roomsForTest().has(chatId)) await new Promise((r) => setTimeout(r, 20));
    assertEquals(relay.roomsForTest().has(chatId), true, "the room never opened — the case proves nothing");
    await sweepChats();
    assertEquals(await end, 4003, "an open room was not closed 4003 when its conversation ended");
  } finally {
    await server.shutdown();
    relay.roomsForTest().delete(chatId);
  }
});
