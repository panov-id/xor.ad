// What the conversation screen asks of the node besides lines and keys, over
// the one core (depth/core/client.ts): one's own span (PATCH /chats/:id),
// the end by hand (DELETE /chats/:id) and the block (POST /blocks {chat}).
// Nothing here signs or names a path — the Client does, as for the terminal.

import type { Client } from "../../../depth/core/client.ts";
import { isSpan, type Span } from "../chat/span.ts";

export type Outcome = { ok: true } | { ok: false; status: number };

// The span the node kept — what was asked, unless the node answered another
// of the four; a refusal (404 past one's own term, 400) throws with the
// status in it, as the core words it.
export async function setSpan(client: Client, chatId: string, span: Span): Promise<Span> {
  const kept = await client.setChatSpan(chatId, span);
  return isSpan(kept) ? kept : span;
}

// Closed for both, or refused with the status the node named.
export async function endChat(client: Client, chatId: string): Promise<Outcome> {
  const answer = await client.closeChat(chatId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  return answer.status === 200 || answer.status === 204 ? { ok: true } : { ok: false, status: answer.status };
}

// A block by the conversation (§8.9, protocol §4.8): 204 whatever happened —
// the node never tells whether the target existed. The shared conversation
// closes for both; the rooms get 4003.
export async function blockByChat(client: Client, chatId: string): Promise<Outcome> {
  const answer = await client.blockByChat(chatId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  return answer.status === 204 || answer.status === 200 ? { ok: true } : { ok: false, status: answer.status };
}
