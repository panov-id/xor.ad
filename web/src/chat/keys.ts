// The conversation's keys in the web face (chat spec §8.13), on depth/core/seal.ts.
//
// The core's Client keeps its ephemeral pairs and conversations in memory and
// nowhere else — the terminal has no disk by design. A page does: after a
// reload the pair is gone, and the conversation opens again from the wrap the
// node keeps for this session (PUT/GET /chats/:id/keys, db/061), under the
// session's wrap key. So the pairs, the wraps and the open conversations live
// here, beside the Client, and the Client is used for what it does not need
// keys for: signed calls, tickets, the socket.
//
//   consent   a fresh ephemeral pair, its half signed by the long key over
//             "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI (routes/matches.ts)
//   open      the peer's half from the inbox row → openAndWrap: the two
//             direction keys, non-extractable, and their wrap for this session
//             → PUT /chats/:id/keys at the chat's epoch
//   reopen    no pair in memory (a reload) → GET /chats/:id/keys →
//             unwrapConversation under the session's wrap private half
//   lines before the second's consent wait here, unsealed, on this device
//             (§8.5; the node hears nothing of them), and go sealed in order
//             once the chat opens
//
// What is not here: the key reissue (§8.13, POST /chats/:id/rekey) — a chat
// whose epochs differ says so and does not seal under the old keys.

import type { Client } from "../../../depth/core/client.ts";
import { type Conversation, Ephemeral, safetyCode, unwrapConversation, verifyHalf } from "../../../depth/core/seal.ts";

export interface ChatRow {
  kind: "chat";
  id: string;
  me: string;
  match_id?: string;
  key_epoch: number;
  rekey_requested: boolean;
  peer: {
    key_epoch: number;
    identity_id: string;
    identity_public_key: string;
    ephemeral_public_key?: string;
    ephemeral_signature?: string;
  };
}

export type Answer<T = Record<string, unknown>> = { status: number; body: T };

export class ChatKeys {
  // By match id until the chat opens, then by chat id too — each with the
  // epoch it was published at (0 from consent, higher from a reissue): ours to
  // remember, as the core says, never the node's to tell.
  #pairs = new Map<string, { eph: Ephemeral; epoch: number }>();
  #open = new Map<string, { conversation: Conversation; epoch: number }>();
  #queued = new Map<string, string[]>();
  // Whether the node kept this session's wrap of the chat's keys at the epoch
  // (PUT /chats/:id/keys), or refused and why: what a reload will find.
  #kept = new Map<string, { epoch: number; refused?: string }>();

  keptOnNode(chatId: string): { epoch: number; refused?: string } | null {
    return this.#kept.get(chatId) ?? null;
  }

  // `signing`: the long key's signing half — the Client keeps its own private;
  // the face gets one from client.held.signing() at registration, or from the
  // tab's record after a reload (tab_session.ts).
  constructor(private readonly client: Client, private readonly signing: CryptoKey) {}

  // POST /matches/:id/consent with this side's half. "waiting" until the other
  // side agrees; "agreed" with the chat_id once both have.
  async consent(matchId: string): Promise<Answer<{ state: string; chat_id?: string }>> {
    const held = this.#pairs.get(matchId) ?? { eph: await Ephemeral.generate(), epoch: 0 };
    this.#pairs.set(matchId, held);
    const answer = await this.client.request<{ state: string; chat_id?: string }>(
      "POST", `/matches/${encodeURIComponent(matchId)}/consent`, await held.eph.publish(this.signing, matchId),
    );
    if (answer.status === 200 && answer.body.chat_id) this.#pairs.set(answer.body.chat_id, held);
    return answer;
  }

  // The lines written while the other side has not agreed (§8.5): on this
  // device, unsealed — there is no key yet.
  queue(matchId: string, text: string): void {
    const lines = this.#queued.get(matchId) ?? [];
    lines.push(text);
    this.#queued.set(matchId, lines);
  }
  queued(matchId: string): readonly string[] {
    return this.#queued.get(matchId) ?? [];
  }
  dropQueued(matchId: string): void {
    this.#queued.delete(matchId);
  }

  // The conversation of a chat: from this device's pair and the peer's half
  // when the pair is here, else from the wrap the node kept for this session.
  async open(row: ChatRow): Promise<Conversation> {
    const known = this.#open.get(row.id);
    if (known && known.epoch === row.key_epoch) return known.conversation;
    if (row.key_epoch !== row.peer.key_epoch) {
      throw new Error(row.peer.key_epoch > row.key_epoch
        ? "the other side asked for new keys: agree before writing"
        : "the other side has not answered the key reissue yet");
    }
    const held = this.#pairs.get(row.id) ?? (row.match_id ? this.#pairs.get(row.match_id) : undefined);
    // A pair of another epoch is not this chat's pair any more (a reissue went
    // past it): the wrap the node kept, if any, is what opens the chat.
    const eph = held && held.epoch === row.key_epoch ? held.eph : undefined;
    let conversation: Conversation;
    if (eph) {
      if (!row.peer.ephemeral_public_key || !row.peer.ephemeral_signature || (row.key_epoch === 0 && !row.match_id)) {
        throw new Error("the peer's ephemeral half is missing: this conversation has no keys");
      }
      const wrapPublicSpki = this.client.wrapPublicSpki;
      if (!wrapPublicSpki) throw new Error("this session has no wrap key: the conversation cannot be kept");
      const made = await eph.openAndWrap(
        { ephemeral_public_key: row.peer.ephemeral_public_key, ephemeral_signature: row.peer.ephemeral_signature },
        row.peer.identity_public_key,
        row.key_epoch === 0 ? { match: row.match_id! } : { chat: row.id, epoch: row.key_epoch },
        row.id, row.me, row.peer.identity_id,
        { wrapPublicSpki, epoch: row.key_epoch },
      );
      conversation = made.conversation;
      this.#pairs.set(row.id, held!);
      // The wrap is what survives a reload. A node that refuses it leaves the
      // conversation open for this tab only; the refusal is named, not hidden.
      const kept = await this.client.request<{ error?: { code?: string } }>(
        "PUT", `/chats/${encodeURIComponent(row.id)}/keys`, { epoch: row.key_epoch, wrapped_key: made.wrapped },
      );
      if (kept.status === 200) {
        this.#kept.set(row.id, { epoch: row.key_epoch });
      } else {
        // The screen says it (Chat.tsx): a reload of this tab loses the
        // conversation, because the node holds no wrap to open it from.
        this.#kept.set(row.id, { epoch: row.key_epoch, refused: `${kept.status} ${kept.body?.error?.code ?? ""}`.trim() });
      }
    } else {
      conversation = await this.reopen(row);
    }
    conversation.bindSafetyCode(await safetyCode(this.client.longSpki, row.peer.identity_public_key));
    this.#open.set(row.id, { conversation, epoch: row.key_epoch });
    return conversation;
  }

  // GET /chats/:id/keys → unwrap under this session's wrap private half.
  async reopen(row: ChatRow): Promise<Conversation> {
    const wrapPrivate = this.client.wrapPrivate;
    if (!wrapPrivate) throw new Error("this session has no wrap key: the conversation cannot be reopened");
    const got = await this.client.request<{ epoch?: number; current_epoch?: number; wrapped_key?: string; error?: { code?: string } }>(
      "GET", `/chats/${encodeURIComponent(row.id)}/keys`,
    );
    if (got.status !== 200 || typeof got.body.wrapped_key !== "string" || typeof got.body.epoch !== "number") {
      throw new Error(got.status === 404 && got.body.error?.code === "no_wrap"
        ? "this device holds no keys for the conversation: ask for a reissue"
        : `the conversation's keys could not be read: ${got.status}`);
    }
    if (got.body.epoch !== got.body.current_epoch) throw new Error("the kept keys are of an older epoch: a reissue is needed");
    try {
      return await unwrapConversation(got.body.wrapped_key, wrapPrivate, row.id, got.body.epoch, row.me, row.peer.identity_id);
    } catch (e) {
      // A wrap that is not this session's, not this chat's, or not a wrap at
      // all (WebCrypto throws a DataError with no words for a broken SPKI):
      // one message, and the way out is the reissue.
      throw new Error(`the kept keys do not open on this device: ask for a reissue${(e as Error).message ? ` (${(e as Error).message})` : ""}`);
    }
  }

  // Seal a line and hand it to the node (POST /chats/:id/messages). A resend
  // passes the line's own localId, so the node keeps one row (W14-RS).
  async say(row: ChatRow, text: string, given?: string): Promise<{ localId: string; answer: Answer<{ local_id?: string; accepted?: boolean; error?: string }> }> {
    const conversation = await this.open(row);
    const localId = given ?? crypto.randomUUID();
    const answer = await this.client.sendMessage(row.id, localId, await conversation.seal(text, localId));
    return { localId, answer };
  }

  // The queue of the match this chat came from, sealed and sent in order; the
  // first line that does not go stops the rest, which stay queued.
  // The lines that went, with their ids — the screen shows them as its own.
  async flush(row: ChatRow): Promise<Array<{ localId: string; text: string }>> {
    if (!row.match_id) return [];
    const lines = [...this.queued(row.match_id)];
    const sent: Array<{ localId: string; text: string }> = [];
    for (const line of lines) {
      const { localId, answer } = await this.say(row, line);
      if (answer.status !== 202) break;
      sent.push({ localId, text: line });
    }
    const left = lines.slice(sent.length);
    if (left.length === 0) this.#queued.delete(row.match_id);
    else this.#queued.set(row.match_id, left);
    return sent;
  }

  async read(row: ChatRow, ciphertext: string, localId: string): Promise<string> {
    return (await this.open(row)).open(ciphertext, localId);
  }

  // The key reissue (§8.13), one side at a time, as the core does it
  // (client.ts requestRekey/acceptRekey). Ask: a fresh pair published at the
  // epoch after the highest either side holds — this device lost its keys, or
  // holds a wrap that does not open. Agree: the other side's request checked
  // first — their half signed by their long key for this chat at exactly the
  // epoch after ours — then our own fresh pair at that epoch. The node drops
  // the old wraps on agreement; open() wraps the new keys afresh.
  async requestRekey(row: ChatRow): Promise<Answer<{ state: string; epoch: number }>> {
    return this.#publishAt(row.id, Math.max(row.key_epoch, row.peer.key_epoch) + 1);
  }

  async acceptRekey(row: ChatRow): Promise<Answer<{ state: string; epoch: number }>> {
    if (!row.rekey_requested) throw new Error("the other side has not asked for new keys");
    // Ours is the epoch this device published at, when it holds a pair; the
    // node's report of our epoch otherwise (as the core: client.ts acceptRekey).
    const mine = this.#pairs.get(row.id)?.epoch ?? row.key_epoch;
    if (row.peer.key_epoch !== mine + 1) throw new Error("the request is not for the epoch after ours");
    if (!row.peer.ephemeral_public_key || !row.peer.ephemeral_signature ||
        !(await verifyHalf(
          { ephemeral_public_key: row.peer.ephemeral_public_key, ephemeral_signature: row.peer.ephemeral_signature },
          row.peer.identity_public_key, { chat: row.id, epoch: row.peer.key_epoch },
        ))) {
      throw new Error("the request for new keys is not signed by the other side");
    }
    return this.#publishAt(row.id, row.peer.key_epoch);
  }

  async #publishAt(chatId: string, epoch: number): Promise<Answer<{ state: string; epoch: number }>> {
    const eph = await Ephemeral.generate();
    const answer = await this.client.request<{ state: string; epoch: number }>(
      "POST", `/chats/${encodeURIComponent(chatId)}/rekey`,
      { epoch, ...(await eph.publish(this.signing, { chat: chatId, epoch })) },
    );
    if (answer.status === 200) {
      this.#pairs.set(chatId, { eph, epoch });
      this.#open.delete(chatId);
    }
    return answer;
  }

  // The safety code of an open conversation (§8.13), for the menu.
  safetyCodeOf(chatId: string): string | null {
    const open = this.#open.get(chatId);
    if (!open) return null;
    try { return open.conversation.safetyCode; } catch { return null; }
  }

  forget(chatId: string): void {
    this.#open.delete(chatId);
    this.#pairs.delete(chatId);
  }
}
