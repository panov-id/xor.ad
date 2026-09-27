// The table's socket in the web face (C1; protocol §4.4; G1e): a ticket from
// POST /tables/:id/ticket, the room on GET /chat, frames handed to the screen
// in order — as the conversation's socket does (chat/room.ts), on the core's
// openTable and reconnect.ts.
//
// A close: 4005 the seat is gone (stood up, dropped) — the room does not come
// back and the screen leaves; 1000 one's own stop; anything else — the node
// restarted, the line dropped, the ticket went stale — back in after a delay
// that doubles to half a minute, and the screen reads the table whole again.

import type { Client, Frame } from "../../../depth/core/client.ts";
import { reconnectDelay } from "../../../depth/core/reconnect.ts";
import { openTable, SEAT_LOST } from "../../../depth/core/tables.ts";

export type TableEvent = { kind: "connected" } | { kind: "frame"; frame: Frame } | { kind: "gone" } | { kind: "reconnecting"; inMs: number };

export function connectTable(client: Client, tableId: string, on: (event: TableEvent) => void): { stop(): void } {
  let stopped = false;
  let current: { close(): void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const loop = async () => {
    let attempt = 0;
    while (!stopped) {
      let code = 1006;
      try {
        const room = await openTable(client, tableId);
        current = room;
        await room.protocol();
        attempt = 0;
        on({ kind: "connected" });
        for (;;) {
          const next = await Promise.race([
            room.next(24 * 3_600_000).then((f) => ({ frame: f })),
            room.closed.then((c) => ({ code: c })),
          ]);
          if ("code" in next) { code = next.code; break; }
          if (stopped) { code = 1000; break; }
          on({ kind: "frame", frame: next.frame });
        }
      } catch {
        code = 1006;
      }
      current = null;
      if (stopped || code === 1000) return;
      if (code === SEAT_LOST) return on({ kind: "gone" });
      const inMs = reconnectDelay(attempt++);
      on({ kind: "reconnecting", inMs });
      await new Promise<void>((resolve) => { timer = setTimeout(resolve, inMs); });
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
