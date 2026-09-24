// The depth core's client: the protocol calls a person makes, signed, over
// plain HTTP. No DOM, no Ink — the terminal and, later, the web draw on top.
//
// **Three placeholders, said here and nowhere pretended otherwise.** The node
// checks their shape and cannot read their content, so they are enough to prove
// the protocol, and not enough for a person:
// - the PIN proof. §8.2 derives it from the PIN with Argon2id, 64 MB and t=3
//   (docs/chat_RU.md, measured 2026-08-28); the parallelism and where the
//   device salt comes from are not named yet (review panel 2026-09-21,
//   PANEL_2026-09-21_steps1-2.md), so a random proof stands in;
// - the paper code: `recovery_lookup_id` and `recovery_wrapped_key` come from
//   halves of a code the person writes down; random bytes stand in;
// - the node's share of the vault key is sent and not yet used to open a vault.

import { base64url, generateSigningKey, signRequest, type SigningKey } from "./sign.ts";
import { Conversation, Ephemeral, safetyCode, verifyHalf } from "./seal.ts";

const PROTOCOL_MAJOR = "1";
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Answer<T = unknown> {
  status: number;
  body: T;
  // Seconds from Retry-After on 429 and 503 (protocol §6), when the node gave it.
  retryAfter?: number;
}

// The five circles the contract allows (openapi.yaml PhraseCreate.area_radius).
export type Radius = 100 | 300 | 1000 | 3000 | 10000;

// Protocol §6: 409 comes in two shapes. A stale edition of the documents is
// LegalReacceptance — `error` is the string legal_reacceptance_required and the
// documents to accept come with it; every other conflict is an ApiError with
// `error.code`. The terminal answers the first with the documents screen and
// the second with the line for its code (depth-core panel, 2026-09-21).
export function conflictOf(answer: Answer): "reacceptance" | string | null {
  if (answer.status !== 409) return null;
  const body = answer.body as { error?: unknown } | null;
  if (body?.error === "legal_reacceptance_required") return "reacceptance";
  const code = (body?.error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "conflict";
}

// One Article 17 statement, as GET /statements gives it. `until` absent means
// indefinitely; the appeal routes are the same three for everyone.
export interface Statement {
  id: string;
  restriction: "removed" | "hidden" | "offer_taken_down" | "access_restricted";
  until?: number;
  facts: string;
  ground_kind: "legal" | "contractual";
  ground_text: string;
  automated_used: boolean;
  created_at: number;
}

// A card of GET /likes: the feed's own shape, with how the like stands.
// `matched` means an offer to talk came out of it, and the like is spent.
export interface Liked {
  id: string;
  text: string;
  like_count: number;
  state: "liked" | "matched";
  liked_at: number;
  // A private author's offer: its like cannot be taken back (the node answers
  // `spent`), whatever the state says.
  offer?: { discount_value: string; conditions?: string | null };
}

// GET /identities/me as the terminal reads it. `phrases` are one's own live
// ones, a waiting one without its end; `stepped_away_until` only while away.
export interface Profile {
  name: string;
  name_pending?: string;
  name_state: "accepted" | "pending" | "rejected";
  age: number;
  phrases?: Array<{ id: string; expires_at?: number }>;
  stepped_away_until?: number;
}

export class Client {
  #key: SigningKey | null = null;
  // The private half of the wrapping pair. Kept, not dropped: anything sealed to
  // wrap_pub must stay openable (depth-core panel, 2026-09-21).
  #wrapPrivate: CryptoKey | null = null;
  #session = "";
  identityId = "";

  // Test stands only: the node trusts x-client-ip when x-origin-token matches its
  // ORIGIN_TOKEN, as it trusts the edge. Each test client then looks like its own
  // address, so a run of many registrations does not meet the per-address limit
  // meant for strangers. Unset outside tests — the edge sets these, not a client.
  #edge: Record<string, string> = {};

  constructor(private readonly base: string, private readonly apiKey: string) {
    // Deno in the tests, Node under the terminal face: the same variable, and
    // neither runtime's absence may throw here.
    const env = globalThis as { Deno?: { env: { get(name: string): string | undefined } }; process?: { env: Record<string, string | undefined> } };
    const token = env.Deno ? env.Deno.env.get("DEPTH_ORIGIN_TOKEN") : env.process?.env.DEPTH_ORIGIN_TOKEN;
    if (token) {
      const r = crypto.getRandomValues(new Uint8Array(3));
      this.#edge = { "x-origin-token": token, "x-client-ip": `10.${r[0]}.${r[1]}.${r[2]}` };
    }
  }

  async #call<T>(method: string, path: string, body?: unknown, signed = true): Promise<Answer<T>> {
    const url = new URL(path, this.base).toString();
    const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
    const headers: Record<string, string> = { "x-protocol-version": PROTOCOL_MAJOR, ...this.#edge };
    if (body !== undefined) headers["content-type"] = "application/json";
    // The key goes on every call: it says which face, the signature which
    // person, and a signed call without it lands unattributed (2026-09-22).
    headers["x-api-key"] = this.apiKey;
    if (signed) {
      if (!this.#key) throw new Error("not registered: there is no key to sign with");
      Object.assign(headers, await signRequest(this.#key, this.#session, method, url, raw));
    }
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : raw });
    const text = await response.text();
    // A refusal that is not JSON — a proxy's HTML, a 502 — keeps its status and
    // its text instead of throwing (depth-core panel, 2026-09-21).
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    }
    const retry = Number(response.headers.get("retry-after"));
    return {
      status: response.status,
      body: parsed as T,
      ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}),
    };
  }

  // POST /identities — name and age, then the PIN's proof with the node's share,
  // then the paper code, all at once (§13 step 1: three steps, all required).
  //
  // `testOnly` is required while the three secrets are placeholders: a terminal
  // built on this core as it is would register people who can never unlock or
  // recover (depth-core panel, 2026-09-21). The test scripts pass it; nothing
  // else should until the PIN and the paper code are real.
  async register(
    who: { name: string; age: number },
    opts: { testOnly?: boolean } = {},
  ): Promise<{ identityId: string; sessionId: string }> {
    if (!opts.testOnly) {
      throw new Error("register: the PIN proof and the paper code are still placeholders; pass testOnly");
    }
    this.#key = await generateSigningKey();
    const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
    this.#wrapPrivate = wrap.privateKey;
    const answer = await this.#call<{ identity_id: string; session_id: string }>("POST", "/identities", {
      sign_pub: this.#key.publicSpki,
      wrap_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey))),
      name: who.name,
      age: who.age,
      auth_hash: await sha256hex(random(32)), // placeholder: Argon2id of the PIN
      share: base64url(random(32)),
      recovery_lookup_id: crypto.randomUUID(), // placeholder: from the paper code
    }, false);
    if (answer.status !== 200) throw new Error(`registration refused: ${answer.status} ${JSON.stringify(answer.body)}`);
    this.#session = answer.body.session_id;
    this.identityId = answer.body.identity_id;
    return { identityId: this.identityId, sessionId: this.#session };
  }

  // POST /recovery/confirm — the paper code is written down; until then the
  // registration is unfinished and most routes refuse it.
  async confirmPaperCode(): Promise<void> {
    const answer = await this.#call("POST", "/recovery/confirm", {
      recovery_wrapped_key: base64url(random(48)), // placeholder: the key under the code
    });
    if (answer.status !== 204) throw new Error(`the paper code was not confirmed: ${answer.status}`);
  }

  // What the node will accept (§8.3). The client is open and hostile, so this
  // is a courtesy, not a guard: the node refuses regardless. A face that
  // carried its own number told people a sentence would fit and then watched
  // the node refuse it (review panel, 2026-09-22).
  async limits(): Promise<{ phrase_length: number; chat_ciphertext_chars: number }> {
    const answer = await this.#call<{ phrase_length: number; chat_ciphertext_chars: number }>("GET", "/limits", undefined, false);
    if (answer.status !== 200) throw new Error(`the node did not state its limits: ${answer.status}`);
    return answer.body;
  }

  async profile(): Promise<Profile> {
    const answer = await this.#call<Profile>("GET", "/identities/me");
    if (answer.status !== 200) throw new Error(`profile refused: ${answer.status}`);
    return answer.body;
  }

  // PATCH /identities/me — any subset; a new name answers 202 and waits for
  // the queue, the rest answers 200 with the profile as it stands (§8.2).
  editProfile(patch: {
    name?: string; age?: number; filter_age_min?: number | null; filter_age_max?: number | null; languages?: string[];
  }): Promise<Answer> {
    return this.#call("PATCH", "/identities/me", patch);
  }

  // POST /feed — 202 means "being read", not "published" (§8.3).
  say(phrase: { text: string; mode: string; lat: number; lon: number; radius: Radius }): Promise<Answer> {
    return this.#call("POST", "/feed", {
      text: phrase.text, mode: phrase.mode, lat: phrase.lat, lon: phrase.lon, area_radius: phrase.radius,
    });
  }

  // `after` walks the cursor of protocol §6; an empty `next` is the end.
  async feed(at: { lat: number; lon: number; radius: Radius; after?: string }): Promise<{ items: unknown[]; next?: string | null }> {
    const q = new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), radius: String(at.radius) });
    if (at.after) q.set("after", at.after);
    const answer = await this.#call<{ items: unknown[]; next?: string | null }>("GET", `/feed?${q}`);
    if (answer.status !== 200) throw new Error(`feed refused: ${answer.status} ${JSON.stringify(answer.body)}`);
    return answer.body;
  }

  like(phraseId: string): Promise<Answer<{ state: string; match_id?: string }>> {
    return this.#call("POST", `/feed/${encodeURIComponent(phraseId)}/like`);
  }

  // DELETE /feed/:id/like — unliked, or spent once a match came of that phrase.
  unlike(phraseId: string): Promise<Answer<{ state: string }>> {
    return this.#call("DELETE", `/feed/${encodeURIComponent(phraseId)}/like`);
  }

  // POST /matches/:id/consent — waiting, or agreed with the chat_id it opened
  // (step 5). Since 2026-09-22 it carries this side's ephemeral half for the
  // chat, signed by the long key (§8.13); the pair is kept here, in memory,
  // until the conversation is opened or the client is dropped.
  // Each pair with the epoch it was published at — ours to remember, not the
  // node's to tell. The node reports epochs in the inbox, and a node that
  // could set them could roll a chat back to an old half whose signature
  // still holds (step-6 reissue panel, 2026-09-22, security 1).
  #ephemeral = new Map<string, { eph: Ephemeral; epoch: number }>();
  #conversations = new Map<string, { conversation: Conversation; epoch: number }>();

  async consent(matchId: string): Promise<Answer<{ state: string; chat_id?: string }>> {
    if (!this.#key) throw new Error("not registered: there is no key to sign with");
    const held = this.#ephemeral.get(matchId) ?? { eph: await Ephemeral.generate(), epoch: 0 };
    this.#ephemeral.set(matchId, held);
    const answer = await this.#call<{ state: string; chat_id?: string }>(
      "POST", `/matches/${encodeURIComponent(matchId)}/consent`, await held.eph.publish(this.#key.privateKey, matchId),
    );
    // The half belongs to the chat that opened, whichever match it came from.
    if (answer.status === 200 && answer.body.chat_id) this.#ephemeral.set(answer.body.chat_id, held);
    return answer;
  }

  // The chat opened on the peer's consent, after ours answered "waiting":
  // the pair still sits under the match id, and the inbox says which chat.
  #pairFor(chatId: string, matchId?: string): { eph: Ephemeral; epoch: number } | undefined {
    const direct = this.#ephemeral.get(chatId);
    if (direct || !matchId) return direct;
    const viaMatch = this.#ephemeral.get(matchId);
    if (viaMatch) this.#ephemeral.set(chatId, viaMatch);
    return viaMatch;
  }

  // The conversation's keys, from the peer's half in the inbox and our own
  // pair (§8.13). The inbox is read every time: an epoch that moved — the
  // other side asked for new keys — must stop us sealing under the old ones
  // (panel, security 6). Both sides must stand at the epoch we published at;
  // any other number, lower or higher, is refused rather than followed.
  async openConversation(chatId: string, matchId?: string): Promise<Conversation> {
    const held = this.#pairFor(chatId, matchId);
    if (!held) throw new Error("no ephemeral pair for this chat: consent was not given from this client");
    const row = await this.#chatRow(chatId);
    if (row.key_epoch !== held.epoch || row.peer.key_epoch !== held.epoch) {
      throw new Error(
        row.peer.key_epoch > held.epoch
          ? "the other side asked for new keys: agree before writing"
          : "the node reports another epoch than the one this client published at",
      );
    }
    const known = this.#conversations.get(chatId);
    if (known && known.epoch === held.epoch) return known.conversation;
    if (!row.peer.ephemeral_public_key || !row.peer.ephemeral_signature || (held.epoch === 0 && !row.match_id)) {
      // Cannot happen against a node that requires the half; an older node
      // or a moved match leaves the conversation with no keys, and it says so.
      throw new Error("the peer's ephemeral half is missing: this conversation has no keys");
    }
    const conversation = await held.eph.open(
      { ephemeral_public_key: row.peer.ephemeral_public_key, ephemeral_signature: row.peer.ephemeral_signature },
      row.peer.identity_public_key,
      held.epoch === 0 ? { match: row.match_id! } : { chat: chatId, epoch: held.epoch },
      chatId, row.me, row.peer.identity_id,
    );
    // From the very row whose long key verified the half: one read, one key.
    conversation.bindSafetyCode(await safetyCode(this.#key!.publicSpki, row.peer.identity_public_key));
    this.#conversations.set(chatId, { conversation, epoch: held.epoch });
    return conversation;
  }

  // Seal a line and send it (§8.13 over POST /chats/:id/messages).
  async sayInChat(chatId: string, text: string, matchId?: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }>> {
    const conversation = await this.openConversation(chatId, matchId);
    const localId = crypto.randomUUID();
    return this.sendMessage(chatId, localId, await conversation.seal(text, localId));
  }

  // Open an incoming frame's ciphertext with the peer's direction key.
  // `localId` is the frame's id — the additional data the box was sealed under.
  async read(chatId: string, ciphertext: string, localId: string, matchId?: string): Promise<string> {
    return (await this.openConversation(chatId, matchId)).open(ciphertext, localId);
  }

  async #chatRow(chatId: string): Promise<{
    me: string; match_id?: string; key_epoch: number; rekey_requested: boolean;
    peer: { identity_id: string; identity_public_key: string; key_epoch: number; ephemeral_public_key?: string; ephemeral_signature?: string };
  }> {
    const row = (await this.inbox()).find((i) => i.kind === "chat" && i.id === chatId);
    if (!row) throw new Error("the chat is not in the inbox");
    return row as never;
  }

  // The key reissue of §8.13, one side at a time. A side that lost its pair
  // asks: a new ephemeral pair, published at the next epoch. The other side,
  // once its person agrees (the terminal's screen for that question is not
  // built — this method is that agreement, and nothing calls it on its own),
  // answers at the same epoch. Old boxes stay shut for both.
  async #publishAt(chatId: string, epoch: number): Promise<Answer<{ state: string; epoch: number }>> {
    if (!this.#key) throw new Error("not registered: there is no key to sign with");
    const eph = await Ephemeral.generate();
    const answer = await this.#call<{ state: string; epoch: number }>(
      "POST", `/chats/${encodeURIComponent(chatId)}/rekey`,
      { epoch, ...(await eph.publish(this.#key.privateKey, { chat: chatId, epoch })) },
    );
    if (answer.status === 200) {
      this.#ephemeral.set(chatId, { eph, epoch });
      this.#conversations.delete(chatId);
    }
    return answer;
  }

  async requestRekey(chatId: string): Promise<Answer<{ state: string; epoch: number }>> {
    const row = await this.#chatRow(chatId);
    return this.#publishAt(chatId, Math.max(row.key_epoch, row.peer.key_epoch) + 1);
  }

  async rekeyRequested(chatId: string): Promise<boolean> {
    return (await this.#chatRow(chatId)).rekey_requested;
  }

  // Before agreeing, the request itself is checked: the other side's half
  // must be signed by their long key for this chat at exactly the epoch after
  // ours. A request the node made up — a row moved, an old half — is refused
  // before anything is signed or thrown away (panel, security 2).
  async acceptRekey(chatId: string): Promise<Answer<{ state: string; epoch: number }>> {
    const held = this.#ephemeral.get(chatId);
    const row = await this.#chatRow(chatId);
    if (!row.rekey_requested) throw new Error("the other side has not asked for new keys");
    const mine = held?.epoch ?? row.key_epoch;
    if (row.peer.key_epoch !== mine + 1) throw new Error("the request is not for the epoch after ours");
    if (!row.peer.ephemeral_public_key || !row.peer.ephemeral_signature ||
        !(await verifyHalf(
          { ephemeral_public_key: row.peer.ephemeral_public_key, ephemeral_signature: row.peer.ephemeral_signature },
          row.peer.identity_public_key, { chat: chatId, epoch: row.peer.key_epoch },
        ))) {
      throw new Error("the request for new keys is not signed by the other side");
    }
    return this.#publishAt(chatId, row.peer.key_epoch);
  }

  // Death of the chat (§8.13): both keys and the ephemeral pair are forgotten.
  forget(chatId: string): void {
    this.#conversations.delete(chatId);
    this.#ephemeral.delete(chatId);
  }

  // PATCH /chats/:id — my own span in this conversation: 10, 30, 60 minutes or
  // 260, "while we're talking" (§8.6). It moves my end and nobody else's.
  async setChatSpan(chatId: string, span: 10 | 30 | 60 | 260): Promise<number> {
    const answer = await this.#call<{ span: number }>("PATCH", `/chats/${encodeURIComponent(chatId)}`, { span });
    if (answer.status !== 200) throw new Error(`the span refused: ${answer.status}`);
    return answer.body.span;
  }

  // POST /away — step away for a span of limits.tsv away.span.*; one
  // transaction takes one's phrases, given likes and matches (§8.2). The
  // answer is when it ends.
  async stepAway(span: "short" | "hour" | "long"): Promise<number> {
    const answer = await this.#call<{ until: number; error?: { code?: string } }>(
      "POST", "/away", { span, nonce: base64url(random(16)) },
    );
    // A lost answer and a second press both meet 409 stepped_away: the step
    // away did happen, and the profile says until when (review panel 23.09.2026).
    if (answer.status === 409 && answer.body?.error?.code === "stepped_away") {
      const until = (await this.profile()).stepped_away_until;
      if (typeof until === "number" && Number.isFinite(until)) return until;
    }
    if (answer.status !== 200 || !Number.isFinite(answer.body.until)) throw new Error(`stepping away refused: ${answer.status}`);
    return answer.body.until;
  }

  // DELETE /away — come back early.
  async comeBack(): Promise<void> {
    const answer = await this.#call("DELETE", "/away");
    if (answer.status !== 204) throw new Error(`coming back refused: ${answer.status}`);
  }

  // "Not now", and taking it back while the match lives (screen 7).
  decline(matchId: string): Promise<Answer> {
    return this.#call("POST", `/matches/${encodeURIComponent(matchId)}/decline`);
  }

  undoDecline(matchId: string): Promise<Answer> {
    return this.#call("DELETE", `/matches/${encodeURIComponent(matchId)}/decline`);
  }

  // POST /chats/:id/messages — a ciphertext (base64url) under a local_id the
  // sender keeps; 202 {local_id, accepted} whoever is on the other end (§8.8).
  sendMessage(chatId: string, localId: string, ciphertext: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }>> {
    return this.#call("POST", `/chats/${encodeURIComponent(chatId)}/messages`, { local_id: localId, ciphertext });
  }

  received(chatId: string, ids: string[]): Promise<Answer> {
    return this.#call("POST", `/chats/${encodeURIComponent(chatId)}/received`, { ids });
  }

  // POST /blocks — by what one can see: a phrase or a conversation, never an
  // identity. 204 whatever happened; the nonce keeps a replay from restoring a
  // block that was lifted (protocol §2, §4.8).
  blockByChat(chatId: string): Promise<Answer> {
    return this.#call("POST", "/blocks", { chat: chatId, nonce: base64url(random(16)) });
  }

  // GET /blocks — my blocks as opaque handles with the moment they were set,
  // newest first. No names and no phrases: the list must not lead back to the
  // person (§8.9, decided 16.09.2026).
  async blocks(): Promise<Array<{ id: string; since: number }>> {
    const answer = await this.#call<Array<{ id: string; since: number }>>("GET", "/blocks");
    if (answer.status !== 200) throw new Error(`the blocks list refused: ${answer.status}`);
    return answer.body;
  }

  // DELETE /blocks/:id — lift a block. 204 for any handle, mine or not (SEC-14).
  unblock(handle: string): Promise<Answer> {
    return this.#call("DELETE", `/blocks/${encodeURIComponent(handle)}`);
  }

  blockByPhrase(phraseId: string): Promise<Answer> {
    return this.#call("POST", "/blocks", { feed: phraseId, nonce: base64url(random(16)) });
  }

  // POST /hidden — a phrase leaves my own feed and nobody else's, and its
  // author never learns (§8.9). The answer is an opaque handle, not the
  // phrase's id: taking it back goes by that handle.
  async hide(phraseId: string): Promise<string> {
    const answer = await this.#call<{ id: string }>("POST", "/hidden", { feed: phraseId });
    if (answer.status !== 200) throw new Error(`hiding refused: ${answer.status}`);
    return answer.body.id;
  }

  // GET /hidden — what I hid, newest first, as handles with their text.
  async hidden(): Promise<Array<{ id: string; kind: string; text: string }>> {
    const answer = await this.#call<Array<{ id: string; kind: string; text: string }>>("GET", "/hidden");
    if (answer.status !== 200) throw new Error(`the hidden list refused: ${answer.status}`);
    return answer.body;
  }

  // DELETE /hidden/:id — the phrase comes back to my feed while it is alive.
  // 204 whatever happened, so a handle that is gone tells the caller nothing.
  unhide(handle: string): Promise<Answer> {
    return this.#call("DELETE", `/hidden/${encodeURIComponent(handle)}`);
  }

  // Every id a path carries came from the node, and the node is the adversary
  // (§8.13): encoded, so "../hidden/x" cannot make me sign a request to another
  // route (security lens, 23.09.2026).

  // GET /likes — what I liked that is still alive, newest like first, thirty
  // at a time (§4.10). A liked phrase is not in the feed any more, so this is
  // where a like is taken back from.
  async likes(after?: string): Promise<{ items: Liked[]; next: string | null }> {
    const path = after ? `/likes?after=${encodeURIComponent(after)}` : "/likes";
    const answer = await this.#call<{ items: Liked[]; next: string | null }>("GET", path);
    // A cursor this node will not open any more: its key rolled, or it came
    // from an older image (the node seals cursors since 2026-09-24). Not a
    // failure of the list — the caller starts again from the first page.
    if (after && answer.status === 400) throw new CursorRefused();
    if (answer.status !== 200) throw new Error(`the likes refused: ${answer.status}`);
    return answer.body;
  }

  // GET /statements — the Article 17 statements of reasons addressed to me
  // (dsa/SPEC §7): there is usually no e-mail, so the app is where they are
  // read. Pages of a hundred, followed to the end; ten pages is a thousand
  // restrictions on one person, and past that the cursor is not trusted.
  async statements(): Promise<Statement[]> {
    const all: Statement[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const path = after ? `/statements?after=${encodeURIComponent(after)}` : "/statements";
      const answer = await this.#call<{ items: Statement[]; next?: string }>("GET", path);
      if (answer.status !== 200) throw new Error(`the statements refused: ${answer.status}`);
      all.push(...answer.body.items);
      if (!answer.body.next) break;
      after = answer.body.next;
    }
    return all;
  }

  // GET /inbox — offers to talk and conversations in one answer (§8.12).
  async inbox(): Promise<Array<Record<string, unknown>>> {
    const answer = await this.#call<{ items: Array<Record<string, unknown>> }>("GET", "/inbox");
    if (answer.status !== 200) throw new Error(`inbox refused: ${answer.status}`);
    return answer.body.items;
  }

  // DELETE /chats/:id — closed by hand, for both at once (screen 8).
  closeChat(chatId: string): Promise<Answer<{ state: string }>> {
    return this.#call("DELETE", `/chats/${encodeURIComponent(chatId)}`);
  }

  // POST /chats/:id/ticket — one ticket, one socket, thirty seconds.
  async ticket(chatId: string): Promise<string> {
    const answer = await this.#call<{ ticket: string }>("POST", `/chats/${encodeURIComponent(chatId)}/ticket`);
    if (answer.status !== 200) throw new Error(`no ticket: ${answer.status} ${JSON.stringify(answer.body)}`);
    return answer.body.ticket;
  }

  async openRoom(chatId: string): Promise<Room> {
    return await this.openRoomWith(await this.ticket(chatId));
  }

  // The ticket rides in Sec-WebSocket-Protocol next to the protocol's name,
  // `xor.p1, ticket.<t>` — never in the query (protocol §4.4, §6).
  // `withVersion: false` exists for the test that the node refuses it.
  openRoomWith(ticket: string, opts: { withVersion?: boolean } = {}): Promise<Room> {
    const url = new URL("/chat", this.base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const offered = opts.withVersion === false ? [`ticket.${ticket}`] : ["xor.p1", `ticket.${ticket}`];
    return Promise.resolve(new Room(new WebSocket(url, offered)));
  }

  get sessionId(): string {
    return this.#session;
  }
}

// The node answered 400 to an `after` it had issued: start from the first page.
export class CursorRefused extends Error {
  constructor() {
    super("the node no longer opens this cursor");
  }
}

export interface Frame {
  type: string;
  seq: number;
  data: unknown;
}

// The frames of one socket, in order, taken one at a time; `closed` resolves to
// the close code, so a refused ticket (4001) can be told from a dropped line.
export class Room {
  #waiting: Array<(f: Frame) => void> = [];
  #frames: Frame[] = [];
  readonly closed: Promise<number>;

  constructor(private readonly socket: WebSocket) {
    socket.onmessage = (e) => {
      const f = JSON.parse(String(e.data)) as Frame;
      const next = this.#waiting.shift();
      if (next) next(f);
      else this.#frames.push(f);
    };
    this.closed = new Promise((resolve) => (socket.onclose = (e) => resolve(e.code)));
  }

  // The close code, or 0 if the socket is still open after the time: a test that
  // waits on it fails with a word instead of hanging the run.
  closedWithin(ms = 5000): Promise<number> {
    return Promise.race([this.closed, new Promise<number>((r) => setTimeout(() => r(0), ms))]);
  }

  // The subprotocol the node chose, once the socket is open.
  protocol(): Promise<string> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve(this.socket.protocol);
    return new Promise((resolve) => this.socket.addEventListener("open", () => resolve(this.socket.protocol), { once: true }));
  }

  next(timeoutMs = 5000): Promise<Frame> {
    const ready = this.#frames.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no frame within the time")), timeoutMs);
      this.#waiting.push((f) => { clearTimeout(timer); resolve(f); });
    });
  }

  close(): void {
    this.socket.close(1000);
  }
}
