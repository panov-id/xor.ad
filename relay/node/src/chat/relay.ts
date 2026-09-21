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
// Close codes (protocol §4.4): 4001 a ticket expired, spent or wrong.

import { listen, queryOrThrow } from "../lib/db.ts";
import { sha256hex } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay

interface Room {
  socket: WebSocket;
  session: string;
  chat: string;
  seq: number;
}

const rooms = new Map<string, Set<Room>>(); // key: chat id
let listening: Promise<void> | null = null;

function frame(room: Room, type: string, data: unknown): void {
  if (room.socket.readyState !== WebSocket.OPEN) return;
  room.seq += 1;
  room.socket.send(JSON.stringify({ type, seq: room.seq, data }));
}

async function hand(room: Room, localId: string | null): Promise<void> {
  const rows = await queryOrThrow<{ local_id: string; ciphertext: Uint8Array; created_at: Date }>(
    `SELECT local_id, ciphertext, created_at FROM pending_deliveries
      WHERE chat = $1 AND recipient_session = $2 AND ($3::uuid IS NULL OR local_id = $3)
      ORDER BY created_at, local_id`,
    [room.chat, room.session, localId],
  );
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

function ensureListening(): Promise<void> {
  listening ??= listen("chat_message", (payload) => {
    const [chat, localId] = payload.split(":");
    for (const room of rooms.get(chat) ?? []) {
      hand(room, localId).catch((error) => log("error", "room hand-over failed", { error: String(error) }));
    }
  });
  return listening;
}

export async function relayUpgrade(req: Request): Promise<Response> {
  if ((req.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return new Response("a websocket upgrade is expected here", { status: 426 });
  }
  const offered = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const token = offered[0] ?? "";
  // Spent in the statement that reads it: a ticket opens one room, once.
  const [spent] = token
    ? await queryOrThrow<{ session: string; chat: string }>(
      `DELETE FROM socket_tickets WHERE token_hash = $1 AND expires_at > now()
        RETURNING session, chat`,
      [await sha256hex(new TextEncoder().encode(token))],
    ).catch(() => [])
    : [];

  const { socket, response } = Deno.upgradeWebSocket(req, token ? { protocol: token } : {});
  if (!spent) {
    socket.onopen = () => socket.close(4001, "ticket expired, spent or wrong");
    inc("relay_chat_rooms_total", { result: "bad_ticket" });
    return response;
  }
  await ensureListening();
  const room: Room = { socket, session: spent.session, chat: spent.chat, seq: 0 };
  socket.onopen = () => {
    const set = rooms.get(room.chat) ?? new Set();
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
