// The depth core's client: the protocol calls a person makes, signed, over
// plain HTTP. No DOM, no Ink — the terminal and, later, the web draw on top.
//
// The PIN and the paper code are real since 2026-09-26 (A5): the PIN's proof
// comes from pin.ts, the lookup and the wrapped long key from paper.ts. One
// thing still is not, and it is the owner's decision, not a placeholder: there
// is no volume (docs/depth-client_RU.md §6), so the node's share of the vault
// key is sent and never used to open anything — there is no file for it to
// open, and the device salt the PIN is derived with lives only as long as the
// process.

import { base64url, signRequest, type SigningKey } from "./sign.ts";
import { Conversation, Ephemeral, fromBase64url, safetyCode, verifyHalf } from "./seal.ts";
import { derivePin, newDeviceSalt } from "./pin.ts";
import { derivePaperCode, wrapLongKey } from "./paper.ts";
import { PendingQueue } from "./pending.ts";
import { decodeSealable, encodeSealable, open as openSealed, seal, vaultKey } from "./lock.ts";

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

// What happened since the last visit, as GET /inbox counts it (§8.12, step 8).
export type InboxEvents = {
  new_matches: number;
  waiting_for_you: number;
  new_chats: number;
  pending_messages: number;
  ending_soon: number;
};

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
  // Only on an offer, with liked: the like counted and the offer's match waits
  // for this person's name to pass the queue (§8.5 S7, 2026-09-26).
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

// A row of GET /inbox (§8.12) as the faces read it. `match`: an offer to talk
// waiting for consent; `offer_interest` (P3b, 2026-09-26): somebody liked my
// offer — the one-sided match of §8.5, where the other side has no phrase and
// the reason is my own offer, given whole in `offer` while it lives; `chat`: a
// conversation, with what the keys need (peer, epochs). Marks since the last
// look ride on every row (P3).
export interface InboxItem {
  kind: "match" | "offer_interest" | "chat";
  id: string;
  name?: string;
  age?: number;
  state?: string;
  match_id?: string;
  phrase?: { text: string; mode: string };
  offer?: { id: string; text: string; mode: string; discount_value?: string | null; conditions?: string | null };
  waiting_for_you?: boolean;
  // Whether I agreed already and wait for them (relay routes/inbox.ts, P10).
  my_consent?: "waiting" | "none";
  chat_expires_at?: number;
  my_span?: number;
  arrived_since?: boolean;
  answered_since?: boolean;
  opened_since?: boolean;
  pending_messages?: number;
  ending_soon?: boolean;
  [more: string]: unknown;
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

  // ── The lock (lock.ts; depth-client §, 2026-09-17) ──
  // The PIN's local half and the share the node keeps, from the last time the
  // PIN was set or proved on this device: the vault key is HKDF of the two.
  // Absent on a path that set no PIN here (a same-device raise by the paper
  // code) — then the lock gates but seals nothing, and says so.
  #pinLocal: Uint8Array | null = null;
  #share: Uint8Array | null = null;
  #locked = false;
  #sealed: Uint8Array | null = null;

  get locked(): boolean {
    return this.#locked;
  }

  // Whether a lock could be opened again: a PIN was set on this device, so its
  // salt is here to derive the proof with. A device raised by the paper code
  // or arrived at by a move has a session before it has a PIN (seat() → the
  // restorePin / arrivedPin screens), and a lock there would have no way out
  // but Ctrl-C — unlock() throws "locked without a device salt" (verifier of
  // P4, 2026-09-26). The face arms the idle timer on this, not on `registered`.
  get canLock(): boolean {
    return this.#key !== null && this.#deviceSalt !== null;
  }

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

  async #call<T>(method: string, path: string, body?: unknown, signed = true, signal?: AbortSignal): Promise<Answer<T>> {
    const url = new URL(path, this.base).toString();
    const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
    const headers: Record<string, string> = { "x-protocol-version": PROTOCOL_MAJOR, ...this.#edge };
    if (body !== undefined) headers["content-type"] = "application/json";
    // The key goes on every call: it says which face, the signature which
    // person, and a signed call without it lands unattributed (2026-09-22).
    headers["x-api-key"] = this.apiKey;
    if (signed) {
      if (!this.#key) throw new Error("not registered: there is no key to sign with");
      // Locked: nothing signed leaves but the proof that opens it (§8.2). The
      // words are the screen's to translate; the core states the fact.
      if (this.#locked && !(method === "POST" && path === "/vault/share")) throw new Error("locked: the PIN opens it");
      Object.assign(headers, await signRequest(this.#key, this.#session, method, url, raw));
    }
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : raw, signal });
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

  // The salt the PIN is derived with on this device (pin.ts). Without a volume
  // it lives as long as the process, as the identity does.
  #deviceSalt: Uint8Array | null = null;
  // The long key under the paper code: what POST /recovery/confirm takes, and
  // kept after it — ciphertext, useless without the code — because a reissue
  // unwraps it under the current code and wraps it under the next (recovery.ts;
  // quorum 3/3 in the artel, 2026-09-26: not a claim for it, whose side effects
  // re-arm the first-PIN grant, and not a long key kept extractable).
  #wrappedLongKey: Uint8Array | null = null;

  // POST /identities — name and age, then the PIN's proof with the node's share,
  // then the paper code, all at once (§13 step 1: three steps, all required).
  //
  // The long key is born extractable, because §8.2 wraps it under the paper
  // code and WebCrypto wraps nothing else (chat spec §8.13, "извлекаем
  // всегда"); the key this client signs with is the unwrapped copy, which is
  // not. The extractable one is dropped with this call (quorum, 2026-09-26).
  // The code itself is the caller's to make (paper.ts newPaperCode) and to
  // show: the core never keeps it.
  async register(
    who: { name: string; age: number },
    secrets: { pin: string; paperCode: string },
    // A keeper for the long key a move can open again (transfer.ts HeldKey),
    // given the key while it is still extractable — here and nowhere later.
    // `unlockPub`: the public half of an unlock key, base64url SPKI, from a
    // face with a disk (db/063; the web's vault.ts) — the node accepts that
    // key on POST /vault/share alone. The terminal has no disk and sends none.
    // `holdWrap`: a face with a disk takes the wrapping pair's private half
    // as pkcs8, once, to seal it beside the long key (W1d, 2026-09-26): the
    // chat keys of P2 are wrapped under this session's wrap_public_key, and a
    // session that came back after a reload with a fresh pair could open none
    // of them. What this client keeps is a non-extractable copy.
    opts: {
      hold?: (extractable: CryptoKey) => Promise<HeldLongKey>;
      unlockPub?: string;
      holdWrap?: (pkcs8: Uint8Array) => Promise<void>;
    } = {},
  ): Promise<{ identityId: string; sessionId: string }> {
    const salt = newDeviceSalt();
    const [pin, paper] = await Promise.all([derivePin(secrets.pin, salt), derivePaperCode(secrets.paperCode)]);
    const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const { wrapped, privateKey } = await wrapLongKey(long.privateKey, paper.wrapKey);
    const held = opts.hold ? await opts.hold(long.privateKey) : null;
    // The node's half of the vault key is made here and kept here too: the lock
    // seals under HKDF(local ‖ share) without asking the node (lock.ts).
    const share = random(32);
    const key: SigningKey = {
      privateKey,
      publicSpki: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", long.publicKey))),
    };
    const wrap = await newWrapPair(opts.holdWrap);
    const answer = await this.#call<{ identity_id: string; session_id: string }>("POST", "/identities", {
      sign_pub: key.publicSpki,
      wrap_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey))),
      name: who.name,
      age: who.age,
      auth_hash: await sha256hex(pin.auth),
      share: base64url(share),
      recovery_lookup_id: paper.lookupId,
      ...(opts.unlockPub ? { unlock_pub: opts.unlockPub } : {}),
    }, false);
    if (answer.status !== 200) throw new Error(`registration refused: ${answer.status} ${JSON.stringify(answer.body)}`);
    this.#key = key;
    this.#wrapPrivate = wrap.privateKey;
    this.#wrapPublicSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey)));
    this.#deviceSalt = salt;
    this.#wrappedLongKey = wrapped;
    this.#held = held;
    this.#pinLocal = pin.local;
    this.#share = share;
    this.#session = answer.body.session_id;
    this.identityId = answer.body.identity_id;
    return { identityId: this.identityId, sessionId: this.#session };
  }

  // POST /recovery/confirm — the paper code is written down; until then the
  // registration is unfinished and most routes refuse it. Called once the
  // person has typed two of its groups back (the screen's job, §8.2).
  async confirmPaperCode(): Promise<void> {
    if (!this.#wrappedLongKey) throw new Error("not registered: there is no wrapped long key to confirm");
    const answer = await this.#call("POST", "/recovery/confirm", {
      recovery_wrapped_key: base64url(this.#wrappedLongKey),
    });
    if (answer.status !== 204) throw new Error(`the paper code was not confirmed: ${answer.status}`);
  }

  async #pinProof(pin: string): Promise<Uint8Array> {
    if (!this.#deviceSalt) throw new Error("not registered: there is no device salt to derive the PIN with");
    return (await derivePin(pin, this.#deviceSalt)).auth;
  }

  // POST /vault/pin — the old PIN proved, the new one's hash and a new share in
  // one write (§8.2; depth-client §3.6). A wrong old PIN answers 409
  // pin_mismatch with attempts_left, the tenth pin_locked and the session
  // frozen — the same counter as every other proof of the PIN.
  async changePin(current: string, next: string): Promise<Answer<{ error?: { code?: string; attempts_left?: number } }>> {
    if (!this.#deviceSalt) throw new Error("not registered: there is no device salt to derive the PIN with");
    const [proof, fresh] = await Promise.all([this.#pinProof(current), derivePin(next, this.#deviceSalt)]);
    const nextShare = random(32);
    const answer = await this.#call<{ error?: { code?: string; attempts_left?: number } }>("POST", "/vault/pin", {
      nonce: base64url(random(16)),
      current_auth: base64url(proof),
      next_auth_hash: await sha256hex(fresh.auth),
      next_share: base64url(nextShare),
    });
    // The vault key follows the PIN: the next lock seals under the new halves.
    if (answer.status === 200) {
      this.#pinLocal = fresh.local;
      this.#share = nextShare;
    }
    return answer;
  }

  // POST /identities/close — "start again" (§8.2, screen 12): confirmed by the
  // PIN, irreversible, and the paper code dies with it.
  async closeIdentity(pin: string): Promise<Answer<{ error?: { code?: string; attempts_left?: number } }>> {
    return this.#call("POST", "/identities/close", {
      nonce: base64url(random(16)),
      auth: base64url(await this.#pinProof(pin)),
    });
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

  // POST /feed — 200 {state: "published"} to a clean phrase, 202 "checking" to one the queue reads (§8.3; P1, 26.09.2026).
  // With a discount the phrase is a neighbour's offer (offers spec; feed.ts takes
  // discount_value and conditions) — the web face's composer sends one (W2).
  say(phrase: { text: string; mode: string; lat: number; lon: number; radius: Radius; discount_value?: string; conditions?: string }): Promise<Answer> {
    return this.#call("POST", "/feed", {
      text: phrase.text, mode: phrase.mode, lat: phrase.lat, lon: phrase.lon, area_radius: phrase.radius,
      ...(phrase.discount_value ? { discount_value: phrase.discount_value, ...(phrase.conditions ? { conditions: phrase.conditions } : {}) } : {}),
    });
  }

  // `after` walks the cursor of protocol §6; an empty `next` is the end.
  // GET /feed/density — the step under the radius handle, never the number
  // (§8.3): none, few, about_ten, tens, hundreds; people with a live phrase
  // since 2026-09-26. Its own limit, a hundred an hour: 429 is a refusal, and
  // the caller keeps the last step it had.
  async density(at: { lat: number; lon: number; radius: Radius }): Promise<Answer<{ step: string }>> {
    const q = new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), radius: String(at.radius) });
    return await this.#call("GET", `/feed/density?${q}`);
  }

  async feed(at: { lat: number; lon: number; radius: Radius; after?: string }): Promise<{ items: unknown[]; next?: string | null }> {
    const q = new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), radius: String(at.radius) });
    if (at.after) q.set("after", at.after);
    const answer = await this.#call<{ items: unknown[]; next?: string | null }>("GET", `/feed?${q}`);
    if (answer.status !== 200) throw new Error(`feed refused: ${answer.status} ${JSON.stringify(answer.body)}`);
    return answer.body;
  }

  like(
    phraseId: string,
  ): Promise<Answer<{ state: string; match_id?: string; name_pending?: true }>> {
    return this.#call("POST", `/feed/${encodeURIComponent(phraseId)}/like`);
  }

  // DELETE /feed/:id/like — unliked, or spent once a match came of that phrase.
  unlike(phraseId: string): Promise<Answer<{ state: string }>> {
    return this.#call("DELETE", `/feed/${encodeURIComponent(phraseId)}/like`);
  }

  // POST /offers/:id/complaints (O1d): the discount was not given. Private;
  // the e-mail is the only way to answer. 202 {id, counts_towards_autohide}.
  // notifier_email, text up to 1000 — the node and the contract agree since
  // 15c511b (it read `email` before, 2026-09-27).
  complain(offerId: string, email: string, text?: string): Promise<Answer<{ id: string; counts_towards_autohide: boolean }>> {
    return this.#call("POST", `/offers/${encodeURIComponent(offerId)}/complaints`, {
      notifier_email: email,
      ...(text ? { text } : {}),
    });
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

  // Tables (G2) live in tables.ts and reach the node through this door. It
  // opens on /tables and its own segments only: "/tables/../inbox" collapses
  // in new URL and would leave the tables (verifier, 2026-09-27).
  tableCall<T>(method: string, path: string, body?: unknown): Promise<Answer<T>> {
    if (!/^\/tables(\/[^/.%][^/%]*)*$/.test(path)) throw new Error("tableCall is for /tables only");
    return this.#call<T>(method, path, body);
  }

  // A chat's game (GC2; protocol §4.7): /chats/<id>/game and its own segments
  // only, by the same rule as tableCall — a path that leaves the game is refused.
  gameCall<T>(method: string, path: string, body?: unknown): Promise<Answer<T>> {
    if (!/^\/chats\/[^/.%][^/%]*\/game(\/[^/.%][^/%]*)*$/.test(path)) throw new Error("gameCall is for /chats/:id/game only");
    return this.#call<T>(method, path, body);
  }

  async consent(matchId: string): Promise<Answer<{ state: string; chat_id?: string }>> {
    const long = this.#longKey();
    const held = this.#ephemeral.get(matchId) ?? { eph: await Ephemeral.generate(), epoch: 0 };
    this.#ephemeral.set(matchId, held);
    const answer = await this.#call<{ state: string; chat_id?: string }>(
      "POST", `/matches/${encodeURIComponent(matchId)}/consent`, await held.eph.publish(long.privateKey, matchId),
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
    conversation.bindSafetyCode(await safetyCode(this.#longKey().publicSpki, row.peer.identity_public_key));
    this.#conversations.set(chatId, { conversation, epoch: held.epoch });
    return conversation;
  }

  // Seal a line and send it (§8.13 over POST /chats/:id/messages). Lines
  // written before the second's consent go first, in their order: a new line
  // does not overtake them, and if they cannot all go it waits behind them.
  async sayInChat(chatId: string, text: string, matchId?: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }>> {
    if (matchId && this.#pending.size(matchId) > 0) {
      const stuck = await this.#flush(chatId, matchId);
      if (stuck) {
        this.#pending.push(matchId, text);
        return stuck;
      }
    }
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
    const long = this.#longKey();
    const eph = await Ephemeral.generate();
    const answer = await this.#call<{ state: string; epoch: number }>(
      "POST", `/chats/${encodeURIComponent(chatId)}/rekey`,
      { epoch, ...(await eph.publish(long.privateKey, { chat: chatId, epoch })) },
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

  // "Not now", and taking it back while the match lives (screen 7). What was
  // written for this match before the second agreed goes with it.
  async decline(matchId: string): Promise<Answer> {
    const answer = await this.#call("POST", `/matches/${encodeURIComponent(matchId)}/decline`);
    if (answer.status >= 200 && answer.status < 300) this.#pending.drop(matchId);
    return answer;
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
    return (await this.inboxSince()).items;
  }

  // GET /inbox?since= — the same page, with what happened since the moment
  // given (unix seconds) counted in `events` and flagged on the rows (§8.12,
  // step 8). depth keeps no history on disk, so the moment is the last look
  // at the inbox in this run, or nothing: then everything live is new.
  async inboxSince(since?: number): Promise<{ items: Array<Record<string, unknown>>; events: InboxEvents }> {
    const path = since === undefined ? "/inbox" : `/inbox?since=${Math.floor(since)}`;
    const answer = await this.#call<{ items: Array<Record<string, unknown>>; events: InboxEvents }>("GET", path);
    if (answer.status !== 200) throw new Error(`inbox refused: ${answer.status}`);
    return { items: answer.body.items, events: answer.body.events };
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

  // ── Seating an identity that came from elsewhere (B1 restore, B2 move) ──
  //
  // Registration signs requests with the long key itself. An identity raised
  // by the paper code or moved from another device does not: the node checks a
  // request against the session's own key (sessions.sign_public_key) and a
  // chat half against the identity's (identities.identity_public_key), and the
  // new session was born with a fresh key before the long one was unwrapped.
  // So the two are held apart here, and a client that never seats keeps
  // signing both with the one key it registered with.
  #long: SigningKey | null = null;
  // The long key held wrapped under a key of this process, extractable only
  // inside use() — for a move, which seals it to the new device (B2,
  // transfer.ts HeldKey; quorum 3/3, 2026-09-26). Typed here by shape so this
  // file does not import transfer.ts.
  #held: HeldLongKey | null = null;

  get held(): HeldLongKey | null {
    return this.#held;
  }

  // What a face with a disk keeps beside its sealed keys, and hands back to
  // seat(): the salt the PIN is derived with (the long key under the paper
  // code has its getter below). A read-only mirror of what seat() takes (web
  // face, W1, 2026-09-26).
  get deviceSalt(): Uint8Array | null {
    return this.#deviceSalt;
  }

  // The wrapping pair of this session (sessions.wrap_public_key, §8.13): the
  // private half as the non-extractable object it was born as — for the wrap
  // of a conversation's keys (seal.ts unwrapConversation), which a face with a
  // disk keeps between launches (web face, W3, 2026-09-26) — and the public
  // half as base64url SPKI, for the wrap itself (seal.ts openAndWrap). seat()
  // may set both; a seated client without them has no wraps to open.
  #wrapPublicSpki: string | null = null;
  get wrapPrivate(): CryptoKey | null {
    return this.#wrapPrivate;
  }
  get wrapPublicSpki(): string | null {
    return this.#wrapPublicSpki;
  }

  // The long key's public half, base64url SPKI: the one registered with, or
  // the one seat() was given. The node does not say it back.
  get longSpki(): string {
    return this.#longKey().publicSpki;
  }

  #longKey(): SigningKey {
    const key = this.#long ?? this.#key;
    if (!key) throw new Error("not registered: there is no key to sign with");
    return key;
  }

  seat(s: {
    identityId: string;
    sessionId: string;
    sessionKey: SigningKey;
    longKey: CryptoKey;
    // The long key's public half as base64url SPKI — the safety code is made of it.
    longSpki: string;
    wrapPrivate: CryptoKey;
    wrapPublicSpki?: string;
    deviceSalt?: Uint8Array;
    wrappedLongKey?: Uint8Array;
    held?: HeldLongKey;
  }): void {
    this.#key = s.sessionKey;
    this.#long = { privateKey: s.longKey, publicSpki: s.longSpki };
    this.#wrapPrivate = s.wrapPrivate;
    this.#wrapPublicSpki = s.wrapPublicSpki ?? null;
    this.#session = s.sessionId;
    this.identityId = s.identityId;
    if (s.deviceSalt) this.#deviceSalt = s.deviceSalt;
    if (s.wrappedLongKey) this.#wrappedLongKey = s.wrappedLongKey;
    this.#held = s.held ?? null;
    // Whatever this process knew of chats belonged to the session before.
    this.#ephemeral.clear();
    this.#conversations.clear();
    // The queue before a consent lives on the device it was written on; a new
    // session is a new device, and the spec says the queue is lost with it.
    this.#pending.clear();
  }

  // A protocol call for the core's other modules (recovery.ts, transfer.ts):
  // signed by the session when there is one and `signed` is not false.
  request<T>(method: string, path: string, body?: unknown, signed = true, signal?: AbortSignal): Promise<Answer<T>> {
    return this.#call<T>(method, path, body, signed, signal);
  }

  // ── B16 · lines before the second's consent (§8.5, pending.ts) ──
  #pending = new PendingQueue();

  // The first to press "talk" writes while the second has not: the line waits
  // on this device, unsealed — there is no key yet — and the node is told
  // nothing. Past chat.pending.max the oldest goes, silently.
  queueLine(matchId: string, text: string): void {
    this.#pending.push(matchId, text);
  }

  queued(matchId: string): readonly string[] {
    return this.#pending.peek(matchId);
  }

  // The second said "not now", or the match ran out, as the face learned it.
  dropQueued(matchId: string): void {
    this.#pending.drop(matchId);
  }

  // The chat opened: the queue goes, sealed, in order. The answer of the line
  // that could not go, or null when all went; what did not go stays queued.
  flushQueued(chatId: string, matchId: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }> | null> {
    return this.#flush(chatId, matchId);
  }

  async #flush(chatId: string, matchId: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }> | null> {
    const lines = [...this.#pending.peek(matchId)];
    let sent = 0;
    try {
      for (const line of lines) {
        const conversation = await this.openConversation(chatId, matchId);
        const localId = crypto.randomUUID();
        const answer = await this.sendMessage(chatId, localId, await conversation.seal(line, localId));
        if (answer.status !== 202) return answer;
        sent++;
      }
      return null;
    } finally {
      this.#pending.sent(matchId, sent);
    }
  }

  get registered(): boolean {
    return this.#key !== null;
  }

  // The long key under the current paper code, for recovery.ts to rewrap; a
  // reissue the node took hands back the one under the next.
  get wrappedLongKey(): Uint8Array | null {
    return this.#wrappedLongKey;
  }

  holdWrappedLongKey(wrapped: Uint8Array): void {
    this.#wrappedLongKey = wrapped;
  }

  // The PIN's proof for routes of the core's other modules (transfer.ts: POST
  // /sessions/invite asks for it).
  pinProof(pin: string): Promise<Uint8Array> {
    return this.#pinProof(pin);
  }

  // POST /vault/init — the first PIN on this device after the paper code raised
  // the identity (§8.2: "забыт ПИН — задаётся новый с новой долей"). The claim
  // left the grant; a new device salt goes with the new PIN, so the old PIN of
  // this device, if it had one, proves nothing any more.
  async firstPin(pin: string): Promise<Answer<{ error?: { code?: string } }>> {
    const salt = newDeviceSalt();
    const derived = await derivePin(pin, salt);
    const share = random(32);
    const answer = await this.#call<{ error?: { code?: string } }>("POST", "/vault/init", {
      auth_hash: await sha256hex(derived.auth),
      share: base64url(share),
    });
    if (answer.status === 204 || answer.status === 200) {
      this.#deviceSalt = salt;
      this.#pinLocal = derived.local;
      this.#share = share;
    }
    return answer;
  }

  // ── The lock (depth-client §, 2026-09-17; lock.ts) ──
  //
  // Five minutes without a key: the screen is the face's to wipe and the rooms
  // are its to close (unmounting them does); the core, from here, refuses every
  // signed call but the proof that opens it, and puts away what it can write
  // down — the long key's extractable copy and the copy wrapped under the paper
  // code — under HKDF(local ‖ share). `sealed: false` names the one path that
  // set no PIN on this device, where the gate is all there is.
  async lock(): Promise<{ sealed: boolean }> {
    if (this.#locked) return { sealed: this.#sealed !== null };
    this.#locked = true;
    if (!this.#pinLocal || !this.#share) return { sealed: false };
    const key = await vaultKey(this.#pinLocal, this.#share);
    const doc: { longPkcs8?: string; wrappedLongKey?: string } = {};
    if (this.#held) {
      doc.longPkcs8 = base64url(await this.#held.use(async (k) => new Uint8Array(await crypto.subtle.exportKey("pkcs8", k))));
    }
    if (this.#wrappedLongKey) doc.wrappedLongKey = base64url(this.#wrappedLongKey);
    this.#sealed = await seal(key, encodeSealable(doc));
    // Nothing that went into the seal stays out of it. The local half goes too:
    // from here only the PIN, typed again, brings it back. The salt stays — it
    // is what the PIN is derived with, and it is not a secret.
    this.#held = null;
    this.#wrappedLongKey = null;
    if (this.#long && doc.longPkcs8) this.#long = { privateKey: null as unknown as CryptoKey, publicSpki: this.#long.publicSpki };
    this.#pinLocal = null;
    this.#share = null;
    return { sealed: true };
  }

  // POST /vault/share with the PIN's proof: the node counts the attempt and,
  // on the right PIN, hands back the share; the vault key opens the seal.
  // Anything but 200 is the node's refusal, returned as it came (pin_mismatch
  // with attempts_left, pin_locked, rate_limited with retryAfter) for the
  // screen to say. `hold` is the keeper for the long key, as register takes it.
  async unlock(
    pin: string,
    opts: { hold?: (extractable: CryptoKey) => Promise<HeldLongKey> } = {},
  ): Promise<{ ok: true } | { ok: false; answer: Answer<{ error?: { code?: string; attempts_left?: number } }> }> {
    if (!this.#locked) return { ok: true };
    if (!this.#deviceSalt) throw new Error("locked without a device salt: there is no PIN to prove");
    const derived = await derivePin(pin, this.#deviceSalt);
    const answer = await this.#call<{ share?: string; error?: { code?: string; attempts_left?: number } }>(
      "POST", "/vault/share", { auth: base64url(derived.auth) },
    );
    if (answer.status !== 200 || typeof answer.body?.share !== "string") return { ok: false, answer };
    const share = fromBase64url(answer.body.share);
    if (this.#sealed) {
      const doc = decodeSealable(await openSealed(await vaultKey(derived.local, share), this.#sealed));
      if (doc.wrappedLongKey) this.#wrappedLongKey = fromBase64url(doc.wrappedLongKey);
      if (doc.longPkcs8) {
        const pkcs8 = fromBase64url(doc.longPkcs8);
        const extractable = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
        if (opts.hold) this.#held = await opts.hold(extractable);
        if (this.#long) {
          this.#long = {
            privateKey: await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
            publicSpki: this.#long.publicSpki,
          };
        }
      }
      this.#sealed = null;
    }
    this.#pinLocal = derived.local;
    this.#share = share;
    this.#locked = false;
    return { ok: true };
  }
}

// The wrapping pair of a session: ECDH P-256, deriveKey too (P2, 2026-09-26:
// seal.ts wraps the chat keys key to key, so the shared secret never becomes
// bytes; deriveBits stays for transfer.ts openReply). Born non-extractable —
// unless a face with a disk asks for its pkcs8 through `holdWrap`: then it is
// born extractable, handed over once, and what comes back to the caller is a
// non-extractable copy of the same key, imported from the same bytes (W1d).
// Exported for its test: the copy must derive what the original derives.
export const WRAP_ALGORITHM = { name: "ECDH", namedCurve: "P-256" } as const;
export const WRAP_USAGES: KeyUsage[] = ["deriveBits", "deriveKey"];
export async function newWrapPair(holdWrap?: (pkcs8: Uint8Array) => Promise<void>): Promise<CryptoKeyPair> {
  return await bornWithHandover(WRAP_ALGORITHM, WRAP_USAGES, holdWrap);
}

// The same for any pair: born non-extractable, unless a face with a disk takes
// its pkcs8 once — then born extractable, handed over, and what the caller
// keeps is a non-extractable copy imported from the same bytes (W6: the
// session key a raise by paper code makes is kept this way too).
export async function bornWithHandover(
  algorithm: EcKeyGenParams,
  usages: KeyUsage[],
  hold?: (pkcs8: Uint8Array) => Promise<void>,
): Promise<CryptoKeyPair> {
  if (!hold) return await crypto.subtle.generateKey(algorithm, false, usages) as CryptoKeyPair;
  const born = await crypto.subtle.generateKey(algorithm, true, usages) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", born.privateKey));
  // The private half takes the private usages only: a pair is made with
  // "verify" in the list, a private key cannot be imported with it.
  const privateUsages = usages.filter((u) => u !== "verify");
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, algorithm, false, privateUsages);
  try {
    await hold(pkcs8);
  } finally {
    pkcs8.fill(0);
  }
  return { publicKey: born.publicKey, privateKey };
}

// What seat() keeps of a held long key: the shape of transfer.ts HeldKey.
export interface HeldLongKey {
  use<T>(fn: (extractable: CryptoKey) => Promise<T>): Promise<T>;
  signing(): Promise<CryptoKey>;
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
    // The timer is cleared when the close comes first: a pending one fails
    // Deno's leak check in any test that waits on a close (2026-09-27).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<number>((r) => (timer = setTimeout(() => r(0), ms)));
    return Promise.race([this.closed, late]).finally(() => clearTimeout(timer));
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
      const take = (f: Frame) => { clearTimeout(timer); resolve(f); };
      // A reader that gave up leaves the line: otherwise the next frame went
      // to its rejected promise and was lost (verifier, 2026-09-27).
      const timer = setTimeout(() => {
        this.#waiting = this.#waiting.filter((w) => w !== take);
        reject(new Error("no frame within the time"));
      }, timeoutMs);
      this.#waiting.push(take);
    });
  }

  close(): void {
    this.socket.close(1000);
  }
}
