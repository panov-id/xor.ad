// Step 6 (chat spec §8.13): the conversation's keys, wrapped by the client
// under its live session's wrap key and kept here as opaque bytes
// (db/061 chat_key_wraps). The node never opens a wrap. It stores one per
// (chat, session), hands it back to the session that wrote it and to nobody
// else, and drops every wrap of a chat when the chat's keys die: the chat
// closed by hand or by term, or reissued to a new epoch (routes/chats.ts).
//
// A wrap is tied to the epoch it was made at. A client that finds the node's
// epoch above its wrap's has keys it cannot use — the reissue after a device
// change (§8.13) — and starts the reissue rather than opening the old ones.

import type { Query } from "./db.ts";

// limits: the base64url text of a wrap on the wire; db/061 bounds the bytes at
// 768, and 1024 characters of base64url decode to at most 768 bytes.
export const WRAPPED_KEY_MAX = 1024;

export interface KeyWrap {
  key_epoch: number;
  wrapped_key: Uint8Array;
}

// The caller's own row, or null. Only this session's: a wrap under another
// session's key is not this device's business, and a new device after a
// transfer starts with none (§8.13, "begins with an empty screen").
export async function readWrap(run: Query, chatId: string, sessionId: string): Promise<KeyWrap | null> {
  const [row] = await run<KeyWrap>(
    `SELECT key_epoch, wrapped_key FROM chat_key_wraps WHERE chat_id = $1 AND session_id = $2`,
    [chatId, sessionId],
  );
  return row ?? null;
}

// Written over: one live session has one wrap per chat, and a wrap at a new
// epoch replaces the one at the old.
export async function storeWrap(run: Query, chatId: string, sessionId: string, epoch: number, wrapped: Uint8Array): Promise<void> {
  await run(
    `INSERT INTO chat_key_wraps (chat_id, session_id, key_epoch, wrapped_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chat_id, session_id)
       DO UPDATE SET key_epoch = EXCLUDED.key_epoch, wrapped_key = EXCLUDED.wrapped_key, updated_at = now()`,
    [chatId, sessionId, epoch, wrapped],
  );
}

// Every wrap of a chat, for both sides: the keys are gone, so is anything that
// could bring them back (§8.13, "K goes out on the first term").
export async function dropWraps(run: Query, chatId: string): Promise<number> {
  const rows = await run<{ chat_id: string }>(`DELETE FROM chat_key_wraps WHERE chat_id = $1 RETURNING chat_id`, [chatId]);
  return rows.length;
}
