// The conversation's socket in the web face (protocol §4.4), on the core's
// Room and reconnect.ts: a ticket bought by a signed call, the socket opened
// with it, frames read in order, each `message` handed to the screen and
// acknowledged (POST /chats/:id/received) once the screen has it.
//
// A close is read as depth reads it (depth/core/reconnect.ts afterClose):
//   4003          the conversation is over — the tombstone; nothing reconnects
//   1001 1011 1006 4001   the node restarted, the line dropped, the ticket went
//                 stale — back in after a delay that doubles to half a minute
//   4002          this identity left the device — every room is dead
//   4004          this page no longer speaks the node's protocol
//   1000          one's own close (stop)

import type { Client, Frame } from "../../../depth/core/client.ts";
import { afterClose, reconnectDelay } from "../../../depth/core/reconnect.ts";

export type RoomEvent =
  | { kind: "connected" }
  | { kind: "message"; id: string; ciphertext: string; createdAt: number }
  | { kind: "rekey"; epoch: number }
  // A like given inside the live conversation (chat spec §8.7): a starter at
  // the next position, the wording told from this reader's side.
  | { kind: "extra_like"; position: number; text: string; mode: string; direction: "they_liked_yours" | "you_liked_theirs" }
  | { kind: "sys"; data: unknown }
  | { kind: "reconnecting"; attempt: number; inMs: number; code: number }
  | { kind: "over" }
  | { kind: "moved" }
  | { kind: "update" }
  | { kind: "failed"; message: string };

// Runs until stop() or a close that is final. `on` is called from a loop, one
// event at a time, in the order the node sent them.
export function connectRoom(client: Client, chatId: string, on: (event: RoomEvent) => void): { stop(): void } {
  let stopped = false;
  let current: { close(): void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The close code the node announced in a `closed` frame, if it did; read
  // in place of the socket's own when that arrives as a bare 1006.
  let announced: number | null = null;

  const loop = async () => {
    let attempt = 0;
    while (!stopped) {
      let code: number;
      try {
        const room = await client.openRoom(chatId);
        current = room;
        await room.protocol();
        attempt = 0;
        on({ kind: "connected" });
        // Frames until the socket closes: `closed` resolves to the code, and a
        // frame that never comes does not time the loop out.
        for (;;) {
          const next = await Promise.race([
            room.next(24 * 3_600_000).then((f) => ({ frame: f })),
            room.closed.then((c) => ({ code: c })),
          ]);
          if ("code" in next) { code = next.code; break; }
          if (stopped) { code = 1000; break; }
          handle(next.frame);
        }
      } catch (e) {
        if (stopped) return;
        // No ticket for a chat that is not ours any more (POST /chats/:id/ticket
        // 404): the conversation is over — the node's 4003 may reach a page
        // behind a forwarding proxy as a bare 1005/1006 (seen in the e2e stand,
        // vite preview's ws proxy), and the way back in says it plainly.
        if (/no ticket: 404/.test((e as Error).message)) return on({ kind: "over" });
        on({ kind: "failed", message: (e as Error).message });
        code = 1006;
      }
      current = null;
      if (stopped) return;
      if (announced !== null && (code === 1006 || code === 1005)) code = announced;
      announced = null;
      const action = afterClose(code);
      if (action === "over") return on({ kind: "over" });
      if (action === "moved") return on({ kind: "moved" });
      if (action === "update") return on({ kind: "update" });
      if (action === "stay") return;
      const inMs = reconnectDelay(attempt++);
      on({ kind: "reconnecting", attempt, inMs, code });
      await new Promise<void>((resolve) => { timer = setTimeout(resolve, inMs); });
    }
  };

  const handle = (frame: Frame) => {
    if (frame.type === "message") {
      const d = frame.data as { id?: unknown; ciphertext?: unknown; created_at?: unknown };
      if (typeof d?.id === "string" && typeof d.ciphertext === "string") {
        on({ kind: "message", id: d.id, ciphertext: d.ciphertext, createdAt: typeof d.created_at === "number" ? d.created_at : 0 });
      }
    } else if (frame.type === "rekey") {
      const d = frame.data as { epoch?: unknown };
      if (typeof d?.epoch === "number") on({ kind: "rekey", epoch: d.epoch });
    } else if (frame.type === "extra_like") {
      const d = frame.data as { position?: unknown; text?: unknown; mode?: unknown; direction?: unknown };
      if (typeof d?.position === "number" && typeof d.text === "string" &&
        (d.direction === "they_liked_yours" || d.direction === "you_liked_theirs")) {
        on({ kind: "extra_like", position: d.position, text: d.text, mode: typeof d.mode === "string" ? d.mode : "", direction: d.direction });
      }
    } else if (frame.type === "closed") {
      // The node names the close it is about to make (protocol §4.4, frame
      // `closed`). Measured in the e2e stand (W3b, 2026-09-26): a close with
      // 4003 from the node reached the browser as a bare 1006, straight or
      // through the proxy — so the code rides in a frame of its own first.
      const d = frame.data as { code?: unknown };
      if (typeof d?.code === "number") announced = d.code;
    } else {
      on({ kind: "sys", data: { type: frame.type, ...(typeof frame.data === "object" && frame.data ? frame.data as object : {}) } });
    }
  };

  void loop();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      current?.close();
    },
  };
}
