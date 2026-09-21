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
}

export class Client {
  #key: SigningKey | null = null;
  #session = "";
  identityId = "";

  constructor(private readonly base: string, private readonly apiKey: string) {}

  async #call<T>(method: string, path: string, body?: unknown, signed = true): Promise<Answer<T>> {
    const url = new URL(path, this.base).toString();
    const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
    const headers: Record<string, string> = { "x-protocol-version": PROTOCOL_MAJOR };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (signed) {
      if (!this.#key) throw new Error("not registered: there is no key to sign with");
      Object.assign(headers, await signRequest(this.#key, this.#session, method, url, raw));
    } else {
      headers["x-api-key"] = this.apiKey;
    }
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : raw });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  }

  // POST /identities — name and age, then the PIN's proof with the node's share,
  // then the paper code, all at once (§13 step 1: three steps, all required).
  async register(who: { name: string; age: number }): Promise<{ identityId: string; sessionId: string }> {
    this.#key = await generateSigningKey();
    const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
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
  say(phrase: { text: string; mode: string; lat: number; lon: number; radius: number }): Promise<Answer> {
    return this.#call("POST", "/feed", {
      text: phrase.text, mode: phrase.mode, lat: phrase.lat, lon: phrase.lon, area_radius: phrase.radius,
    });
  }

  async feed(at: { lat: number; lon: number; radius: number }): Promise<{ items: unknown[]; next: string | null }> {
    const q = new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), radius: String(at.radius) });
    const answer = await this.#call<{ items: unknown[]; next: string | null }>("GET", `/feed?${q}`);
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

  // POST /matches/:id/consent — waiting, or agreed when both have. The chat it
  // opens is step 5; the ephemeral key §8.5 sends here is step 6.
  consent(matchId: string): Promise<Answer<{ state: string }>> {
    return this.#call("POST", `/matches/${matchId}/consent`);
  }

  // "Not now", and taking it back while the match lives (screen 7).
  decline(matchId: string): Promise<Answer> {
    return this.#call("POST", `/matches/${matchId}/decline`);
  }

  undoDecline(matchId: string): Promise<Answer> {
    return this.#call("DELETE", `/matches/${matchId}/decline`);
  }
}
