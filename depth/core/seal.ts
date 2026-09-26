// The keys of one conversation (chat spec §8.13), in the order the spec gives:
//
//   consent   an EPHEMERAL P-256 pair for this chat; the public half is
//             published signed by the long key
//   opening   S = ECDH(my ephemeral, their ephemeral)
//             K_low_high = HKDF(S, salt = chat_id, info = "low→high")
//             K_high_low = HKDF(S, salt = chat_id, info = "high→low")
//             low and high are the identity ids sorted as in pair_key, so a
//             side knows which key it seals with and which it opens with
//   message   AES-GCM(K of my direction, nonce, text); the nonce is 96 bits
//             from getRandomValues, fresh per message
//   death     both K and the ephemeral pair are forgotten; nothing can open
//             the old ciphertext, for anybody
//
// Two keys, not one (2026-08-21): with a single K a dishonest node could hand
// a sender their own message back as if from the peer, and the cipher would
// not object. With a key per direction a reflected message opens with the
// wrong key, and fails.
//
// The ephemeral private half is never extractable, and it lives only in this
// object; there is no store. The long key takes no part in the encryption —
// it only signs the half, so the peer can tell it is ours and not the node's.

import { base64url } from "./sign.ts";

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const P256_SIGN = { name: "ECDSA", namedCurve: "P-256" } as const;
const NONCE_BYTES = 12;

// What the long key signs for a half (§8.13, bound to the match since
// 2026-09-22): "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI. The node verifies the
// same bytes, so a half cannot be carried into another match, and the long
// key's two uses — request lines and halves — cannot collide.
export const HALF_DOMAIN = "xor.ephemeral.v1\n";
export function halfToSign(matchId: string, spki: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(HALF_DOMAIN + matchId + "\n");
  const out = new Uint8Array(prefix.length + spki.length);
  out.set(prefix);
  out.set(spki, prefix.length);
  return out;
}

// A half published by the key reissue (§8.13) is bound to the chat and the
// epoch instead: "xor.rekey.v1\n<chat_id>\n<epoch>\n" ‖ SPKI. The node checks
// the same bytes (routes/chats.ts rekeyToSign).
export const REKEY_DOMAIN = "xor.rekey.v1\n";
export function rekeyToSign(chatId: string, epoch: number, spki: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${REKEY_DOMAIN}${chatId}\n${epoch}\n`);
  const out = new Uint8Array(prefix.length + spki.length);
  out.set(prefix);
  out.set(spki, prefix.length);
  return out;
}

// What a half was signed as: the match it was consented in, or the chat and
// epoch it was reissued at.
export type Binding = { match: string } | { chat: string; epoch: number };
const signedBytes = (binding: Binding, spki: Uint8Array): Uint8Array =>
  "match" in binding ? halfToSign(binding.match, spki) : rekeyToSign(binding.chat, binding.epoch, spki);

export function fromBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("not base64url");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Which way the message goes, named by the pair's sorted ids (§8.13).
export function direction(from: string, to: string): "low→high" | "high→low" {
  return from < to ? "low→high" : "high→low";
}

export interface EphemeralHalf {
  ephemeral_public_key: string;
  ephemeral_signature: string;
}

// A peer's half, checked against their long key for what it was signed as —
// without deriving anything. Used before agreeing to a reissue.
export async function verifyHalf(theirs: EphemeralHalf, theirLongSpki: string, binding: Binding): Promise<boolean> {
  try {
    const longKey = await crypto.subtle.importKey("spki", fromBase64url(theirLongSpki) as BufferSource, P256_SIGN, false, ["verify"]);
    return await crypto.subtle.verify(
      SIGN, longKey,
      fromBase64url(theirs.ephemeral_signature) as BufferSource,
      signedBytes(binding, fromBase64url(theirs.ephemeral_public_key)) as BufferSource,
    );
  } catch {
    return false;
  }
}

export class Ephemeral {
  private constructor(private readonly pair: CryptoKeyPair, readonly publicSpki: string) {}

  static async generate(): Promise<Ephemeral> {
    const pair = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return new Ephemeral(pair, base64url(spki));
  }

  // The half as consent publishes it: the SPKI and its signature by the long
  // key over the bound bytes for this match.
  async publish(longKey: CryptoKey, binding: string | Binding): Promise<EphemeralHalf> {
    const bound: Binding = typeof binding === "string" ? { match: binding } : binding;
    const signature = new Uint8Array(await crypto.subtle.sign(SIGN, longKey, signedBytes(bound, fromBase64url(this.publicSpki)) as BufferSource));
    return { ephemeral_public_key: this.publicSpki, ephemeral_signature: base64url(signature) };
  }

  // Their half, checked against the long key we matched with, then the two
  // direction keys. Throws if the signature does not hold: a half the node
  // could have minted is not a half.
  async open(theirs: EphemeralHalf, theirLongSpki: string, binding: string | Binding, chatId: string, me: string, them: string): Promise<Conversation> {
    const bound: Binding = typeof binding === "string" ? { match: binding } : binding;
    const longKey = await crypto.subtle.importKey("spki", fromBase64url(theirLongSpki) as BufferSource, P256_SIGN, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      SIGN, longKey,
      fromBase64url(theirs.ephemeral_signature) as BufferSource,
      signedBytes(bound, fromBase64url(theirs.ephemeral_public_key)) as BufferSource,
    );
    if (!ok) throw new Error("the peer's ephemeral half is not signed by their long key");
    const material = await this.#material(theirs, chatId);
    try {
      return await Conversation.fromMaterial(material, me, them);
    } finally {
      material.fill(0);
    }
  }

  // The same opening, plus the keys wrapped for the caller's live session
  // (§8.13, PUT /chats/:id/keys): a client with a disk — the web face — keeps
  // the wrap and opens the chat after a reload without this pair. The raw key
  // material exists only inside this call and is zeroed before it returns;
  // the conversation itself holds non-extractable keys, as always.
  async openAndWrap(
    theirs: EphemeralHalf, theirLongSpki: string, binding: string | Binding, chatId: string, me: string, them: string,
    wrap: { wrapPublicSpki: string; epoch: number },
  ): Promise<{ conversation: Conversation; wrapped: string }> {
    const bound: Binding = typeof binding === "string" ? { match: binding } : binding;
    const longKey = await crypto.subtle.importKey("spki", fromBase64url(theirLongSpki) as BufferSource, P256_SIGN, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      SIGN, longKey,
      fromBase64url(theirs.ephemeral_signature) as BufferSource,
      signedBytes(bound, fromBase64url(theirs.ephemeral_public_key)) as BufferSource,
    );
    if (!ok) throw new Error("the peer's ephemeral half is not signed by their long key");
    const material = await this.#material(theirs, chatId);
    try {
      const [conversation, wrapped] = await Promise.all([
        Conversation.fromMaterial(material, me, them),
        wrapMaterial(material, wrap.wrapPublicSpki, chatId, wrap.epoch),
      ]);
      return { conversation, wrapped };
    } finally {
      material.fill(0);
    }
  }

  // The 64 bytes both direction keys are made of: K_low_high ‖ K_high_low,
  // each HKDF(S, salt = chat_id, info) as the spec derives them. Callers zero it.
  async #material(theirs: EphemeralHalf, chatId: string): Promise<Uint8Array> {
    const theirPublic = await crypto.subtle.importKey("spki", fromBase64url(theirs.ephemeral_public_key) as BufferSource, ECDH, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPublic }, this.pair.privateKey, 256);
    const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
    const salt = new TextEncoder().encode(chatId);
    const derive = (info: string) =>
      crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) }, ikm, 256);
    const [lowHigh, highLow] = await Promise.all([derive("low→high"), derive("high→low")]);
    const material = new Uint8Array(KEY_BYTES * 2);
    material.set(new Uint8Array(lowHigh), 0);
    material.set(new Uint8Array(highLow), KEY_BYTES);
    return material;
  }
}

const KEY_BYTES = 32;
const SPKI_P256_BYTES = 91;

// A wrap (§8.13, db/061 chat_key_wraps) is the two direction keys under the
// live session's wrap key — sessions.wrap_public_key, an ECDH P-256 half whose
// private half the device keeps (client.ts #wrapPrivate). ECDH with a fresh
// pair, so the wrap key itself never meets the material:
//   E        a fresh ECDH P-256 pair, its SPKI (91 bytes) in front of the wrap
//   W        HKDF(ECDH(E, wrap_public_key), salt = chat_id, info = "xor.wrap.v1")
//            → AES-GCM 256
//   wrapped  SPKI(E) ‖ nonce(12) ‖ AES-GCM(W, nonce, K_low_high ‖ K_high_low),
//            additional data "xor.wrap.v1\n<chat_id>\n<epoch>\n"
// base64url on the wire. The additional data binds the wrap to its chat and
// epoch: a wrap the node moves to another chat, or returns at another epoch,
// does not open. A wrap under another session's key does not open either —
// the tag fails — which is the whole promise: the node stores bytes it cannot
// read, and only the device that wrapped can unwrap.
export const WRAP_DOMAIN = "xor.wrap.v1";
const wrapAad = (chatId: string, epoch: number): Uint8Array => new TextEncoder().encode(`${WRAP_DOMAIN}\n${chatId}\n${epoch}\n`);

async function wrapKeyFor(ownPrivate: CryptoKey, otherPublicSpki: Uint8Array, chatId: string): Promise<CryptoKey> {
  const other = await crypto.subtle.importKey("spki", otherPublicSpki as BufferSource, ECDH, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: other }, ownPrivate, 256);
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(chatId), info: new TextEncoder().encode(WRAP_DOMAIN) },
    ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function wrapMaterial(material: Uint8Array, wrapPublicSpki: string, chatId: string, epoch: number): Promise<string> {
  const fresh = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]) as CryptoKeyPair;
  const freshSpki = new Uint8Array(await crypto.subtle.exportKey("spki", fresh.publicKey));
  if (freshSpki.length !== SPKI_P256_BYTES) throw new Error("an ECDH P-256 SPKI that is not 91 bytes");
  const key = await wrapKeyFor(fresh.privateKey, fromBase64url(wrapPublicSpki), chatId);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const box = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: wrapAad(chatId, epoch) }, key, material as BufferSource,
  ));
  const out = new Uint8Array(freshSpki.length + nonce.length + box.length);
  out.set(freshSpki, 0);
  out.set(nonce, freshSpki.length);
  out.set(box, freshSpki.length + nonce.length);
  return base64url(out);
}

// The way back: GET /chats/:id/keys gave `wrapped` at `epoch`; the device's
// wrap private half opens it into a conversation whose keys are, as always,
// non-extractable. Throws on a wrap made under another session's key, for
// another chat, or at another epoch — the AES-GCM tag does not verify.
export async function unwrapConversation(
  wrapped: string, wrapPrivate: CryptoKey, chatId: string, epoch: number, me: string, them: string,
): Promise<Conversation> {
  const bytes = fromBase64url(wrapped);
  if (bytes.length <= SPKI_P256_BYTES + NONCE_BYTES) throw new Error("not a key wrap");
  const key = await wrapKeyFor(wrapPrivate, bytes.subarray(0, SPKI_P256_BYTES), chatId);
  let material: Uint8Array;
  try {
    material = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(SPKI_P256_BYTES, SPKI_P256_BYTES + NONCE_BYTES), additionalData: wrapAad(chatId, epoch) },
      key, bytes.subarray(SPKI_P256_BYTES + NONCE_BYTES),
    ));
  } catch {
    throw new Error("the wrap does not open: not this session's key, chat or epoch");
  }
  try {
    if (material.length !== KEY_BYTES * 2) throw new Error("a wrap that is not two keys");
    return await Conversation.fromMaterial(material, me, them);
  } finally {
    material.fill(0);
  }
}

export class Conversation {
  // Nonces already opened: the node can replay a frame, and a box that opened
  // once does not open twice (step-6 panel, 2026-09-22).
  #seen = new Set<string>();
  #safety: string | null = null;

  // The safety code of this conversation's two long keys, bound once by the
  // client that opened it (see safetyCode above).
  get safetyCode(): string {
    if (this.#safety === null) throw new Error("the safety code was not bound to this conversation");
    return this.#safety;
  }
  bindSafetyCode(code: string): void {
    if (this.#safety !== null) throw new Error("the safety code is bound once");
    this.#safety = code;
  }

  constructor(private readonly sealKey: CryptoKey, private readonly openKey: CryptoKey) {}

  // From the 64 bytes K_low_high ‖ K_high_low: each imported as a
  // non-extractable AES-GCM key, mine to seal with and theirs to open with.
  // The caller zeroes the material; from here on it cannot be read back.
  static async fromMaterial(material: Uint8Array, me: string, them: string): Promise<Conversation> {
    if (material.length !== KEY_BYTES * 2) throw new Error("a conversation's material is two keys");
    const importKey = (bytes: Uint8Array) =>
      crypto.subtle.importKey("raw", bytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const [lowHigh, highLow] = await Promise.all([importKey(material.subarray(0, KEY_BYTES)), importKey(material.subarray(KEY_BYTES))]);
    const mine = direction(me, them);
    return new Conversation(mine === "low→high" ? lowHigh : highLow, mine === "low→high" ? highLow : lowHigh);
  }

  // nonce ‖ ciphertext, base64url — what POST /chats/:id/messages carries. The
  // message's local_id is the additional data: a box the node re-labels under
  // another id does not open.
  async seal(text: string, localId: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const box = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(localId) },
      this.sealKey, new TextEncoder().encode(text),
    ));
    const out = new Uint8Array(nonce.length + box.length);
    out.set(nonce);
    out.set(box, nonce.length);
    return base64url(out);
  }

  // Opens with the peer's direction key only: our own message, reflected by
  // the node, does not open here (§8.13, the reason there are two keys).
  async open(ciphertext: string, localId: string): Promise<string> {
    const bytes = fromBase64url(ciphertext);
    if (bytes.length <= NONCE_BYTES) throw new Error("not a sealed message");
    const nonce = base64url(bytes.subarray(0, NONCE_BYTES));
    if (this.#seen.has(nonce)) throw new Error("a nonce seen before: the frame was replayed");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, NONCE_BYTES), additionalData: new TextEncoder().encode(localId) },
      this.openKey,
      bytes.subarray(NONCE_BYTES),
    );
    this.#seen.add(nonce);
    return new TextDecoder().decode(plain);
  }
}

// The safety code (§8.13, "a key swapped by us"): the node hands out the
// public halves, so it could slip in its own; comparing this code in person or
// by voice is what catches that. It is derived from the two identities' LONG
// keys only — never the ephemeral halves — so it survives a rekey and changes
// only when an identity's key does. Twenty digits in five groups of four
// (owner's decision, 2026-09-22): twelve were ~40 bits, which a node that
// swaps keys can grind in days; twenty are ~66 (security lens, same day).
//   P = the key's point, uncompressed (65 bytes) — one encoding per key, and an
//       SPKI that is not a P-256 point is refused rather than hashed
//   code = SHA-256("xor.safety.v1\n" ‖ min(P_a, P_b) ‖ max(P_a, P_b))
//          first 16 bytes as an unsigned integer, mod 10^20, zero-padded
// The client computes it where the conversation is opened, from the same key
// that verified the peer's half (Client.openConversation): a code taken from
// another read could match while the conversation runs under a planted key
// (security lens, 2026-09-22).
export const SAFETY_DOMAIN = "xor.safety.v1\n";
const POINT_BYTES = 65;

async function longKeyPoint(spki: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("spki", fromBase64url(spki) as BufferSource, P256_SIGN, true, ["verify"]);
  const point = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  if (point.length !== POINT_BYTES || point[0] !== 4) throw new Error("a long key that is not an uncompressed P-256 point");
  return point;
}

export async function safetyCode(longSpkiA: string, longSpkiB: string): Promise<string> {
  const x = await longKeyPoint(longSpkiA);
  const y = await longKeyPoint(longSpkiB);
  const [first, second] = compareBytes(x, y) <= 0 ? [x, y] : [y, x];
  const prefix = new TextEncoder().encode(SAFETY_DOMAIN);
  const input = new Uint8Array(prefix.length + 2 * POINT_BYTES);
  input.set(prefix, 0);
  input.set(first, prefix.length);
  input.set(second, prefix.length + POINT_BYTES);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input as BufferSource));
  let n = 0n;
  for (const byte of digest.subarray(0, 16)) n = (n << 8n) | BigInt(byte);
  const digits = (n % 100_000_000_000_000_000_000n).toString().padStart(20, "0");
  return digits.match(/\d{4}/g)!.join(" ");
}

function compareBytes(x: Uint8Array, y: Uint8Array): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
