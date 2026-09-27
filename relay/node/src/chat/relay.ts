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
import { boardNow } from "../lib/tables.ts";
import { chatGameFrame } from "../lib/chat_games.ts";

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay
const VERSION = "xor.p1";

interface Room {
  socket: WebSocket;
  session: string;
  // The registry key: a chat's id, or "table:<id>" for a table's room (step 8).
  chat: string;
  seq: number;
  // A table's room only: the table, and the identity whose seat keeps it open
  // (4005 when that seat is lost). The identity never leaves the node.
  table?: string;
  identity?: string;
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

// Every close the node makes, one way (protocol §4.4, frame `closed`): the code
// and the reason in a frame of their own, then the close. Measured 2026-09-26
// (W3b, web/e2e/specs/close-code.spec.ts): a browser reached straight from
// this node saw the 4003 close as a bare 1006 — Deno 2.1.4 closing an
// upgraded socket sends no close frame the browser reads — while data frames
// arrive. So the code travels as data first, in the frame before the close. A
// client that got a real code keeps
// it; one that got 1006 reads the frame (depth/core/reconnect.ts stays the
// judge of what a code means).
// `seq` is the frame's own number, the next in the socket's order; the close
// follows in the same turn — the node stops with closeAllRooms() and Deno.exit()
// back to back (main.ts), and a close left to a later turn never happened
// (verifier W3b, 2026-09-27: SIGTERM sent neither the frame nor the close).
function closeWith(socket: WebSocket, seq: number, code: number, reason: string): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "closed", seq, data: { code, reason } }));
  }
  // Closed unless already closing: the test's bare fake socket has no state
  // and must still be closed (chat_hardening.test.ts, "stopping the node…").
  if (socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) socket.close(code, reason);
}
function closeRoom(room: Room, code: number, reason: string): void {
  room.seq += 1;
  closeWith(room.socket, room.seq, code, reason);
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
        -- Nor to a session whose PIN is locked: a locked share is a freeze
        -- (identity_guard.ts, B75), and the freeze that tears this room may be
        -- the minute job's to write, not the tenth miss's — its NOTIFY went
        -- back with it (review panel 5, S1; B85). The lines stay queued and
        -- come once the paper code has opened the share again.
        AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = $2 AND v.locked_at IS NOT NULL)
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
  // A table's room has no queue: its frames come from table_event.
  if (room.table) return;
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
        if (room.session === session) closeRoom(room, 4002, "the session was frozen");
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
    for (const room of rooms.get(chat) ?? []) closeRoom(room, 4003, "the conversation is over");
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

// Step 8, tables (protocol §4.4): `NOTIFY table_event` "<table>|board",
// "<table>|seat" or "<table>|line|<id>" — the state is read here, once per
// notice, and the same frame goes to every room of the table. Public by
// construction (§6.1): nothing in it depends on who is watching, since no
// class keeps a hand yet.
let listeningTables: Promise<void> | null = null;
function ensureListeningTables(): Promise<void> {
  listeningTables ??= listen("table_event", (payload) => {
    const [table, kind, id] = payload.split("|");
    const set = rooms.get(`table:${table}`);
    if (!set || set.size === 0) return;
    // The board is cut per seat — one's own hand, a word to its setter only
    // (§6.1) — so each room gets the board as its own seat sees it.
    if (kind === "board") {
      for (const room of set) {
        boardFrameFor(table, room.identity ?? null)
          .then((data) => {
            if (data === null) return closeRoom(room, 4005, "the seat at the table is lost");
            frame(room, "board", data);
            inc("relay_chat_frames_total", { type: "board" });
          })
          .catch((error) => log("error", "table frame failed", { error: String(error) }));
      }
      return;
    }
    tableFrame(table, kind, id)
      .then((built) => {
        if (!built) return;
        // Only a room with a live seat gets the table's lines and seats: a
        // room whose seat is gone is closed 4005 as the board does (V7).
        for (const room of set) {
          seatedAt(table, room.identity ?? null)
            .then((seated) => {
              if (!seated) return closeRoom(room, 4005, "the seat at the table is lost");
              frame(room, built.type, built.data);
              inc("relay_chat_frames_total", { type: built.type });
            })
            .catch((error) => log("error", "table frame failed", { error: String(error) }));
        }
      })
      .catch((error) => log("error", "table frame failed", { error: String(error) }));
  });
  return listeningTables;
}

// The board as the room's own seat sees it, or null for a room whose seat is
// gone: it gets no board at all (X1, 27.09.2026) and is closed 4005 by the caller.
async function seatedAt(table: string, identity: string | null): Promise<boolean> {
  if (!identity) return false;
  const [mine] = await queryOrThrow<{ seat_no: number }>(
    `SELECT seat_no FROM table_seats WHERE table_id = $1 AND identity = $2 AND left_at IS NULL`,
    [table, identity],
  );
  return mine !== undefined;
}

export async function boardFrameFor(table: string, identity: string | null): Promise<unknown | null> {
  const [mine] = identity
    ? await queryOrThrow<{ seat_no: number }>(
      `SELECT seat_no FROM table_seats WHERE table_id = $1 AND identity = $2 AND left_at IS NULL`,
      [table, identity],
    )
    : [];
  if (!mine) return null;
  return await boardNow(queryOrThrow, table, mine.seat_no);
}

export async function tableFrame(table: string, kind: string, id?: string): Promise<{ type: string; data: unknown } | null> {
  if (kind === "seat") {
    const [counts] = await queryOrThrow<{ playing: number; watching: number }>(
      `SELECT count(*) FILTER (WHERE playing_from IS NOT NULL)::int AS playing,
              count(*) FILTER (WHERE playing_from IS NULL)::int AS watching
         FROM table_seats WHERE table_id = $1 AND left_at IS NULL`,
      [table],
    );
    return { type: "seat", data: counts };
  }
  if (kind === "line" && id) {
    const [line] = await queryOrThrow<Record<string, unknown>>(
      `SELECT id, seat_no AS seat, kind, text, sticker, refuses_seat, floor(extract(epoch from created_at))::int AS created_at
         FROM table_lines WHERE id = $1 AND table_id = $2 AND visible_at IS NOT NULL`,
      [id, table],
    );
    return line ? { type: "line", data: line } : null;
  }
  return null;
}

// A chat's game (protocol §4.7; routes/chat_games.ts): `NOTIFY chat_game`
// "<chat>|board" or "<chat>|proposal". Each room of the chat gets the frame as
// its own side sees it — a hand, a word are cut by seat — so it is built per
// room, from the identity behind the room's session.
let listeningChatGames: Promise<void> | null = null;
function ensureListeningChatGames(): Promise<void> {
  listeningChatGames ??= listen("chat_game", (payload) => {
    const [chat, kind] = payload.split("|");
    for (const room of rooms.get(chat) ?? []) {
      if (room.table) continue;
      chatGameFrameFor(chat, room.session)
        .then((view) => {
          if (kind === "board") frame(room, "board", view?.board ?? null);
          else frame(room, "proposal", view?.pending ?? null);
          inc("relay_chat_frames_total", { type: kind === "board" ? "board" : "proposal" });
        })
        .catch((error) => log("error", "chat game frame failed", { error: String(error) }));
    }
  });
  return listeningChatGames;
}

export async function chatGameFrameFor(chat: string, session: string) {
  const [who] = await queryOrThrow<{ identity: string }>(`SELECT identity FROM sessions WHERE id = $1`, [session]);
  return who ? await chatGameFrame(queryOrThrow, chat, who.identity) : null;
}

// 4005 (protocol §4.4): the seat is lost — stood up, kicked, blocked away,
// stepped away. `NOTIFY seat_left` "<table>:<seat>:<identity>" (lib/tables.ts).
let listeningSeatLeft: Promise<void> | null = null;
function ensureListeningSeatLeft(): Promise<void> {
  listeningSeatLeft ??= listen("seat_left", (payload) => {
    const [table, , identity] = payload.split(":");
    for (const room of rooms.get(`table:${table}`) ?? []) {
      if (room.identity === identity) closeRoom(room, 4005, "the seat at the table is lost");
    }
  });
  return listeningSeatLeft;
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
  await ensureListeningTables();
  await ensureListeningSeatLeft();
  await ensureListeningChatGames();
}

// Every room, closed with 1001 "going away": the node is stopping, and a
// client that sees 1001 reconnects to whatever answers next rather than
// waiting on a socket that will never speak (step-5 panel, 2026-09-21).
export function closeAllRooms(): number {
  let closed = 0;
  for (const set of rooms.values()) {
    for (const room of set) {
      closeRoom(room, 1001, "the node is going away");
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
    socket.onopen = () => closeWith(socket, 1, 4004, "protocol version not supported");
    inc("relay_chat_rooms_total", { result: "bad_version" });
    return response;
  }
  // Spent in the statement that reads it: a ticket opens one room, once.
  // Only for a session that is not frozen: one frozen inside the ticket's thirty
  // seconds must not open a room (step 5 panel, 2026-09-21). Nor one whose PIN
  // the tenth mistake locked while the freeze has not been written yet: the
  // guard already refuses it (lib/identity_guard.ts, B75), and a ticket bought
  // just before the lock was the tab's way back into delivery (B78,
  // 2026-09-26). The answer is a bad ticket's, so the lock is not told.
  let failed = false;
  const [spent] = token
    ? await queryOrThrow<{ session: string; chat: string | null; table_id: string | null; identity: string }>(
      `DELETE FROM socket_tickets t USING sessions s
        WHERE t.token_hash = $1 AND t.expires_at > now()
          AND s.id = t.session AND s.frozen_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = s.id AND v.locked_at IS NOT NULL)
          -- A table's ticket opens a room only while its seat is live: one
          -- bought seated and spent after standing up (or being blocked away)
          -- would open a room that seat_left, long past, never closes (X1,
          -- 27.09.2026). The answer is a bad ticket's.
          AND (t.table_id IS NULL OR EXISTS (
                SELECT 1 FROM table_seats ts
                 WHERE ts.table_id = t.table_id AND ts.identity = s.identity AND ts.left_at IS NULL))
        RETURNING t.session, t.chat, t.table_id, s.identity`,
      [await sha256hex(new TextEncoder().encode(token))],
    ).catch(() => { failed = true; return []; })
    : [];

  const { socket, response } = Deno.upgradeWebSocket(req, { protocol: VERSION });
  if (failed) {
    // A database that failed is not a bad ticket: 1011, and the client retries
    // later instead of buying tickets in a loop.
    socket.onopen = () => closeWith(socket, 1, 1011, "the node failed");
    return response;
  }
  if (!spent) {
    socket.onopen = () => closeWith(socket, 1, 4001, "ticket expired, spent or wrong");
    inc("relay_chat_rooms_total", { result: "bad_ticket" });
    return response;
  }
  await listenForRooms();
  const room: Room = spent.table_id
    ? { socket, session: spent.session, chat: `table:${spent.table_id}`, seq: 0, table: spent.table_id, identity: spent.identity }
    : { socket, session: spent.session, chat: spent.chat!, seq: 0 };
  socket.onopen = () => {
    const set = rooms.get(room.chat) ?? new Set();
    // One room per (chat, session): an older socket of the same session is
    // closed, so tickets cannot pile up rooms (step 5 panel, 2026-09-21).
    for (const older of set) {
      if (older.session === room.session) closeRoom(older, 1000, "replaced by a newer socket");
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
