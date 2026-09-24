// The chat's room: one socket per (chat, session), fed from pending_deliveries
// (chat spec §8.1, §8.8; protocol §4.4).
//
// The socket only carries frames from the node to the person — every action is
// a signed request (protocol §4.4, 2026-09-16). It opens with a one-time ticket
// in Sec-WebSocket-Protocol, never in the query string, which is neither signed
// nor kept out of logs. On opening it hands over whatever waits in the queue for
// this session; after that, `NOTIFY chat_message` from any node tells this one
// that a row was written, and the row is read and sent.
//
// What it does not do: read anything. The node carries ciphertext and holds no keys:
// it goes out as it came in (§8.13). Delivery is not "delivered": the row stays until
// the recipient's POST /chats/:id/received (§8.8), so a frame lost on a dying
// socket comes again on the next one.
//
// Close codes (protocol §4.4): 4001 bad ticket; 4002 session frozen; 4003 the
// conversation is over; 4004 no xor.p1; 1011 the node failed; 1000 replaced.

import { listen, queryOrThrow } from "../lib/db.ts";
import { config } from "../config.ts";
import { sha256hex } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay
const VERSION = "xor.p1";

interface Room {
  socket: WebSocket;
  session: string;
  chat: string;
  seq: number;
  // Lines were held back while its person was away: the next hand-over gives
  // everything that waited, not only the line that woke it.
  held?: boolean;
}

const rooms = new Map<string, Set<Room>>(); // key: chat id
let listening: Promise<void> | null = null;

function frame(room: Room, type: string, data: unknown): void {
  if (room.socket.readyState !== WebSocket.OPEN) return;
  room.seq += 1;
  room.socket.send(JSON.stringify({ type, seq: room.seq, data }));
}

// What waits in the queue for this session of this chat — all of it, or one
// line by its local id. Exported for the database suite: a room needs a socket,
// the question of what it would be handed does not.
export async function pendingFor(
  chat: string,
  session: string,
  localId: string | null,
): Promise<{ local_id: string; ciphertext: Uint8Array; created_at: Date }[]> {
  return await queryOrThrow<{ local_id: string; ciphertext: Uint8Array; created_at: Date }>(
    `SELECT local_id, ciphertext, created_at FROM pending_deliveries
      WHERE chat = $1 AND recipient_session = $2 AND ($3::uuid IS NULL OR local_id = $3)
        -- "No product" while away reaches an open room too: nothing is handed
        -- to it, the lines wait (the owner's decision of 2026-09-24).
        AND NOT EXISTS (SELECT 1 FROM sessions s JOIN identities i ON i.id = s.identity
                         WHERE s.id = $2 AND i.stepped_away_until > now())
      ORDER BY created_at, local_id`,
    [chat, session, localId],
  );
}

async function away(session: string): Promise<boolean> {
  const [row] = await queryOrThrow<{ away: boolean }>(
    `SELECT coalesce(i.stepped_away_until > now(), false) AS away
       FROM sessions s JOIN identities i ON i.id = s.identity WHERE s.id = $1`,
    [session],
  );
  return row?.away ?? false;
}

async function hand(room: Room, localId: string | null): Promise<void> {
  if (await away(room.session)) {
    room.held = true;
    return;
  }
  // A time away can end by itself, with no DELETE /away to announce it: the
  // first hand-over after it gives everything that waited.
  const wasHeld = room.held === true;
  if (wasHeld) localId = null;
  const rows = await pendingFor(room.chat, room.session, localId);
  // Cleared only once what waited is in hand: a failed read keeps it held, and
  // the next hand-over tries everything again (panel 2026-09-24).
  if (wasHeld) room.held = false;
  for (const row of rows) {
    const bytes = row.ciphertext instanceof Uint8Array ? row.ciphertext : new Uint8Array(row.ciphertext);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const ciphertext = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    frame(room, "message", {
      id: row.local_id,
      ciphertext,
      created_at: Math.floor(new Date(row.created_at).getTime() / 1000),
    });
    inc("relay_chat_frames_total", { type: "message" });
  }
}

// Protocol §4.4: freezing a session tears its sockets. lib/sessions.ts sends
// `NOTIFY session_frozen` in the freezing transaction; every node's rooms of
// that session close 4002 (step 5 panel, 2026-09-21: nothing listened).
let listeningFrozen: Promise<void> | null = null;
function ensureListeningFrozen(): Promise<void> {
  listeningFrozen ??= listen("session_frozen", (session) => {
    for (const set of rooms.values()) {
      for (const room of set) {
        if (room.session === session) room.socket.close(4002, "the session was frozen");
      }
    }
  });
  return listeningFrozen;
}

// Protocol §4.4: 4003 — the conversation is over (closed by hand, a term that
// came, §8.10). `NOTIFY chat_closed` carries the chat id; every room of it goes.
let listeningClosed: Promise<void> | null = null;
function ensureListeningClosed(): Promise<void> {
  listeningClosed ??= listen("chat_closed", (chat) => {
    for (const room of rooms.get(chat) ?? []) room.socket.close(4003, "the conversation is over");
  });
  return listeningClosed;
}

// §8.13 reissue: `NOTIFY chat_rekey` carries "<chat>:<epoch>"; every room of
// the chat gets a `rekey` frame, so an open conversation learns that the
// other side asked for new keys, or agreed, without polling its inbox.
let listeningRekey: Promise<void> | null = null;
function ensureListeningRekey(): Promise<void> {
  listeningRekey ??= listen("chat_rekey", (payload) => {
    const [chat, epoch] = payload.split(":");
    for (const room of rooms.get(chat) ?? []) frame(room, "rekey", { epoch: Number(epoch) });
  });
  return listeningRekey;
}

// `NOTIFY chat_sys` carries "<chat>|<json>": a system line for every room of
// the chat — today the changed age of §8.2 ({kind: age_changed, age}).
let listeningSys: Promise<void> | null = null;
function ensureListeningSys(): Promise<void> {
  listeningSys ??= listen("chat_sys", (payload) => {
    const cut = payload.indexOf("|");
    if (cut < 0) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(payload.slice(cut + 1)); } catch { return; }
    // `except`: sessions the line is not for — one's own devices, when it is
    // one's own step away (routes/away.ts). Never sent on.
    const except = Array.isArray(data.except) ? new Set(data.except as string[]) : null;
    delete data.except;
    for (const room of rooms.get(payload.slice(0, cut)) ?? []) {
      if (except?.has(room.session)) continue;
      frame(room, "sys", data);
    }
  });
  return listeningSys;
}

// `NOTIFY session_frame` carries "<session>|<json {type, data}>": a frame for
// every room that one session holds — today the name's verdict (lib/sessions.ts
// frameSessions; protocol §4.4, 2026-09-24).
let listeningSession: Promise<void> | null = null;
function ensureListeningSession(): Promise<void> {
  listeningSession ??= listen("session_frame", (payload) => {
    const cut = payload.indexOf("|");
    if (cut < 0) return;
    const session = payload.slice(0, cut);
    let body: { type?: unknown; data?: unknown };
    try { body = JSON.parse(payload.slice(cut + 1)); } catch { return; }
    if (typeof body.type !== "string") return;
    for (const set of rooms.values()) {
      for (const room of set) if (room.session === session) frame(room, body.type, body.data);
    }
  });
  return listeningSession;
}

function ensureListening(): Promise<void> {
  listening ??= listen("chat_message", (payload) => {
    // "<chat>:<local id>" for a new line; "<chat>::<session>" when a session
    // comes back from a time away and its rooms get what waited (2026-09-24).
    const [chat, localId, only] = payload.split(":");
    for (const room of rooms.get(chat) ?? []) {
      if (only && room.session !== only) continue;
      hand(room, localId || null).catch((error) => log("error", "room hand-over failed", { error: String(error) }));
    }
  });
  return listening;
}

// Every channel a room is served from. Exported for the database suite, which
// puts rooms in by hand and needs the listeners without a ticket.
export async function listenForRooms(): Promise<void> {
  await ensureListening();
  await ensureListeningFrozen();
  await ensureListeningClosed();
  await ensureListeningRekey();
  await ensureListeningSys();
  await ensureListeningSession();
}

// Every room, closed with 1001 "going away": the node is stopping, and a
// client that sees 1001 reconnects to whatever answers next rather than
// waiting on a socket that will never speak (step-5 panel, 2026-09-21).
export function closeAllRooms(): number {
  let closed = 0;
  for (const set of rooms.values()) {
    for (const room of set) {
      room.socket.close(1001, "the node is going away");
      closed++;
    }
  }
  rooms.clear();
  return closed;
}

// The registry, for a test that has no server to open a room through.
export function roomsForTest(): Map<string, Set<Room>> {
  return rooms;
}

export async function relayUpgrade(req: Request): Promise<Response> {
  if ((req.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return new Response("a websocket upgrade is expected here", { status: 426 });
  }
  // A browser names its origin, and only a listed one gets as far as the
  // ticket. A terminal names none and is not a browser. Same list as CORS
  // (lib/cors.ts); empty means the local stand and reflects anything.
  const origin = req.headers.get("origin");
  if (origin && config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(origin)) {
    inc("relay_chat_rooms_total", { result: "bad_origin" });
    return new Response("this origin is not allowed here", { status: 403 });
  }
  // `xor.p1, ticket.<t>` (protocol §4.4, §6): the version by name, the ticket
  // behind its prefix. The answer names the version only.
  const offered = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const speaks = offered.includes(VERSION);
  const token = (offered.find((p) => p.startsWith("ticket.")) ?? "").slice("ticket.".length);
  if (!speaks) {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => socket.close(4004, "protocol version not supported");
    inc("relay_chat_rooms_total", { result: "bad_version" });
    return response;
  }
  // Spent in the statement that reads it: a ticket opens one room, once.
  // Only for a session that is not frozen: one frozen inside the ticket's thirty
  // seconds must not open a room (step 5 panel, 2026-09-21).
  let failed = false;
  const [spent] = token
    ? await queryOrThrow<{ session: string; chat: string }>(
      `DELETE FROM socket_tickets t USING sessions s
        WHERE t.token_hash = $1 AND t.expires_at > now()
          AND s.id = t.session AND s.frozen_at IS NULL
        RETURNING t.session, t.chat`,
      [await sha256hex(new TextEncoder().encode(token))],
    ).catch(() => { failed = true; return []; })
    : [];

  const { socket, response } = Deno.upgradeWebSocket(req, { protocol: VERSION });
  if (failed) {
    // A database that failed is not a bad ticket: 1011, and the client retries
    // later instead of buying tickets in a loop.
    socket.onopen = () => socket.close(1011, "the node failed");
    return response;
  }
  if (!spent) {
    socket.onopen = () => socket.close(4001, "ticket expired, spent or wrong");
    inc("relay_chat_rooms_total", { result: "bad_ticket" });
    return response;
  }
  await listenForRooms();
  const room: Room = { socket, session: spent.session, chat: spent.chat, seq: 0 };
  socket.onopen = () => {
    const set = rooms.get(room.chat) ?? new Set();
    // One room per (chat, session): an older socket of the same session is
    // closed, so tickets cannot pile up rooms (step 5 panel, 2026-09-21).
    for (const older of set) {
      if (older.session === room.session) older.socket.close(1000, "replaced by a newer socket");
    }
    set.add(room);
    rooms.set(room.chat, set);
    inc("relay_chat_rooms_total", { result: "opened" });
    hand(room, null).catch((error) => log("error", "room opening hand-over failed", { error: String(error) }));
  };
  socket.onclose = () => {
    const set = rooms.get(room.chat);
    set?.delete(room);
    if (set && set.size === 0) rooms.delete(room.chat);
  };
  return response;
}
