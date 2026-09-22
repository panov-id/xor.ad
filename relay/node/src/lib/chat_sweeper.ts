// The end of a conversation, kept by the node (chat spec §8.10).
//
// Each side has its own end: COALESCE(last_own_message_at, chats.created_at) +
// its idle_ttl_minutes. When it comes, that side gets gone_at; the queue of the
// chat dies with the first end, because the chat key does (§8.8, §8.13); and a
// chat over for both is deleted, its rows going by cascade. `NOTIFY chat_closed`
// tells every node's rooms to close 4003 (protocol §4.4).
//
// This is the janitor the registry's open item chat.janitor.missing asked for.

import { queryOrThrow, transaction } from "./db.ts";
import { inc } from "./metrics.ts";

export const TERM_PASSED = `COALESCE(p.last_own_message_at, c.created_at)
  + p.idle_ttl_minutes * interval '1 minute' <= now()`;

// Batches, each its own transaction with its NOTIFY inside: a room is told
// "over" only once the ending is committed, and a minute with a thousand
// expiries does not hold one long lock (step-7 panel, 2026-09-21). The loop
// runs until a batch comes back short.
const BATCH = 500;

export async function sweepChats(options: { batch?: number } = {}): Promise<{ ended: number; deleted: number }> {
  const batch = options.batch ?? BATCH;
  let endedTotal = 0;
  for (;;) {
    const ended = await transaction<number>(async (run) => {
      const rows = await run<{ chat_id: string }>(
        `UPDATE chat_participants p SET gone_at = now()
          WHERE (p.chat_id, p.identity) IN (
                  SELECT p2.chat_id, p2.identity FROM chat_participants p2
                    JOIN chats c ON c.id = p2.chat_id
                   WHERE p2.gone_at IS NULL AND ${TERM_PASSED.replaceAll("p.", "p2.")}
                   ORDER BY p2.chat_id, p2.identity
                   LIMIT ${batch}
                   FOR UPDATE OF p2 SKIP LOCKED)
          RETURNING p.chat_id`,
      );
      const chats = [...new Set(rows.map((r) => r.chat_id))];
      if (chats.length > 0) {
        await run(`DELETE FROM pending_deliveries WHERE chat = ANY($1::uuid[])`, [chats]);
        for (const chat of chats) await run(`SELECT pg_notify('chat_closed', $1)`, [chat]);
      }
      return rows.length;
    });
    endedTotal += ended;
    if (ended < batch) break;
  }
  if (endedTotal > 0) inc("relay_chat_ended_total", { by: "term" }, endedTotal);
  const ended = { length: endedTotal };
  // A conversation that is over takes its match with it. The foreign key would
  // otherwise set matches.chat_id to NULL, and the match — both consents still
  // on it — came back into the inbox as pending (step 7 panel, 2026-09-21).
  await queryOrThrow(
    `DELETE FROM matches m USING chats c
      WHERE m.chat_id = c.id
        AND NOT EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)`,
  );
  const deleted = await queryOrThrow<{ id: string }>(
    `DELETE FROM chats c
      WHERE NOT EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)
      RETURNING c.id`,
  );
  if (deleted.length > 0) inc("relay_chat_deleted_total", {}, deleted.length);
  return { ended: ended.length, deleted: deleted.length };
}
