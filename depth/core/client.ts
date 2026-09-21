// The depth core's client: the protocol calls a person makes, signed, over
// plain HTTP. No DOM, no Ink — the terminal and, later, the web draw on top.
//
// **Three placeholders, said here and nowhere pretended otherwise.** The node
// checks their shape and cannot read their content, so they are enough to prove
// the protocol, and not enough for a person:
// - the PIN proof. §8.2 derives it from the PIN with Argon2id, and the
//   parameters are not written down anywhere yet (review panel 2026-09-21,
//   PANEL_2026-09-21_steps1-2.md); a random proof stands in;
// - the paper code: `recovery_lookup_id` and `recovery_wrapped_key` come from
//   halves of a code the person writes down; random bytes stand in;
// - the node's share of the vault key is sent and not yet used to open a vault.

import { base64url, generateSigningKey, signRequest, type SigningKey } from "./sign.ts";

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
    const token = Deno.env.get("DEPTH_ORIGIN_TOKEN");
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
    if (signed) {
      if (!this.#key) throw new Error("not registered: there is no key to sign with");
      Object.assign(headers, await signRequest(this.#key, this.#session, method, url, raw));
    } else {
      headers["x-api-key"] = this.apiKey;
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

  async profile(): Promise<{ name: string; age: number }> {
    const answer = await this.#call<{ name: string; age: number }>("GET", "/identities/me");
    if (answer.status !== 200) throw new Error(`profile refused: ${answer.status}`);
    return answer.body;
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
    return this.#call("POST", `/feed/${phraseId}/like`);
  }

  // DELETE /feed/:id/like — unliked, or spent once a match came of that phrase.
  unlike(phraseId: string): Promise<Answer<{ state: string }>> {
    return this.#call("DELETE", `/feed/${phraseId}/like`);
  }

  // POST /matches/:id/consent — waiting, or agreed with the chat_id it opened
  // (step 5). The ephemeral key §8.5 sends here is step 6.
  consent(matchId: string): Promise<Answer<{ state: string; chat_id?: string }>> {
    return this.#call("POST", `/matches/${matchId}/consent`);
  }

  // "Not now", and taking it back while the match lives (screen 7).
  decline(matchId: string): Promise<Answer> {
    return this.#call("POST", `/matches/${matchId}/decline`);
  }

  undoDecline(matchId: string): Promise<Answer> {
    return this.#call("DELETE", `/matches/${matchId}/decline`);
  }

  // POST /chats/:id/messages — a ciphertext (base64url) under a local_id the
  // sender keeps; 202 {local_id, accepted} whoever is on the other end (§8.8).
  sendMessage(chatId: string, localId: string, ciphertext: string): Promise<Answer<{ local_id: string; accepted?: boolean; error?: string }>> {
    return this.#call("POST", `/chats/${chatId}/messages`, { local_id: localId, ciphertext });
  }

  received(chatId: string, ids: string[]): Promise<Answer> {
    return this.#call("POST", `/chats/${chatId}/received`, { ids });
  }

  // DELETE /chats/:id — closed by hand, for both at once (screen 8).
  closeChat(chatId: string): Promise<Answer<{ state: string }>> {
    return this.#call("DELETE", `/chats/${chatId}`);
  }

  // POST /chats/:id/ticket — one ticket, one socket, thirty seconds.
  async ticket(chatId: string): Promise<string> {
    const answer = await this.#call<{ ticket: string }>("POST", `/chats/${chatId}/ticket`);
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
