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
    const theirPublic = await crypto.subtle.importKey("spki", fromBase64url(theirs.ephemeral_public_key) as BufferSource, ECDH, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPublic }, this.pair.privateKey, 256);
    const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    const salt = new TextEncoder().encode(chatId);
    const derive = (info: string) =>
      crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
        ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
      );
    const [lowHigh, highLow] = await Promise.all([derive("low→high"), derive("high→low")]);
    const mine = direction(me, them);
    return new Conversation(mine === "low→high" ? lowHigh : highLow, mine === "low→high" ? highLow : lowHigh);
  }
}

export class Conversation {
  // Nonces already opened: the node can replay a frame, and a box that opened
  // once does not open twice (step-6 panel, 2026-09-22).
  #seen = new Set<string>();

  constructor(private readonly sealKey: CryptoKey, private readonly openKey: CryptoKey) {}

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
