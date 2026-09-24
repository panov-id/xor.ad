// A time away that ran out by itself (chat spec §8.2, db/047).
//
// DELETE /away tells the rooms of an early return; nothing told them of an end
// by the clock, and a room left held got what waited only when the other side
// happened to write again. This pass is that DELETE for everyone whose time
// ran out: the flag down and the same NOTIFY, in one transaction — a flag
// lowered with no NOTIFY sent is a wake lost for good.

import { transaction } from "./db.ts";
import { inc } from "./metrics.ts";

export async function wakeReturned(): Promise<number> {
  return await transaction(async (run) => {
    const back = await run<{ id: string }>(
      `UPDATE identities SET away_wake_due = false
        WHERE away_wake_due AND stepped_away_until <= now() RETURNING id`,
    );
    if (back.length === 0) return 0;
    // The rooms routes/away.ts wakes on a return: live conversations, and only
    // sessions that can hold a room.
    await run(
      `SELECT pg_notify('chat_message', cp.chat_id || '::' || s.id)
         FROM chat_participants cp JOIN sessions s ON s.identity = cp.identity
        WHERE cp.identity = ANY($1::uuid[]) AND cp.gone_at IS NULL AND s.frozen_at IS NULL`,
      [back.map((b) => b.id)],
    );
    inc("relay_away_woken_total", {}, back.length);
    return back.length;
  });
}
