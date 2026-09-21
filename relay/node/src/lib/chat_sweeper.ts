// The end of a conversation, kept by the node (chat spec §8.10).
//
// Each side has its own end: COALESCE(last_own_message_at, chats.created_at) +
// its idle_ttl_minutes. When it comes, that side gets gone_at; the queue of the
// chat dies with the first end, because the chat key does (§8.8, §8.13); and a
// chat over for both is deleted, its rows going by cascade. `NOTIFY chat_closed`
// tells every node's rooms to close 4003 (protocol §4.4).
//
// This is the janitor the registry's open item chat.janitor.missing asked for.

import { queryOrThrow } from "./db.ts";
import { inc } from "./metrics.ts";

export const TERM_PASSED = `COALESCE(p.last_own_message_at, c.created_at)
  + p.idle_ttl_minutes * interval '1 minute' <= now()`;

export async function sweepChats(): Promise<{ ended: number; deleted: number }> {
  const ended = await queryOrThrow<{ chat_id: string }>(
    `UPDATE chat_participants p SET gone_at = now()
       FROM chats c
      WHERE c.id = p.chat_id AND p.gone_at IS NULL AND ${TERM_PASSED}
      RETURNING p.chat_id`,
  );
  const chats = [...new Set(ended.map((r) => r.chat_id))];
  if (chats.length > 0) {
    await queryOrThrow(`DELETE FROM pending_deliveries WHERE chat = ANY($1::uuid[])`, [chats]);
    for (const chat of chats) await queryOrThrow(`SELECT pg_notify('chat_closed', $1)`, [chat]);
    inc("relay_chat_ended_total", { by: "term" }, ended.length);
  }
  const deleted = await queryOrThrow<{ id: string }>(
    `DELETE FROM chats c
      WHERE NOT EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)
      RETURNING c.id`,
  );
  if (deleted.length > 0) inc("relay_chat_deleted_total", {}, deleted.length);
  return { ended: ended.length, deleted: deleted.length };
}
