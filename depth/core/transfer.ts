// Moving an identity to another device (chat spec §8.2, "Перенос личности —
// код, а не ссылка"): the nine characters, the two envelopes, and the four
// check characters both screens show. The node's half is
// relay/node/src/routes/transfer.ts; it holds both envelopes as opaque bytes,
// so what is inside them is a contract between clients, and the web has to
// repeat it byte for byte for a code shown in one face to move an identity
// into the other. Decided by a quorum of three on 2026-09-26 (B2):
//
//   code      9 × Crockford base32 without I L O U, read back as paper.ts
//             reads the paper code
//   material  Argon2id(code, "xor.ad/device-link/v1", 64 MiB, t=3, p=1)
//   lookup    base64url(material[0..32])  → POST /sessions/invite, /claim
//   secret    material[32..64]            → never leaves the device
//   claim     iv(12) ‖ AES-GCM(secret, JSON {sign_pub, wrap_pub, label}),
//             additional data "<domain>\nclaim\n<lookup>"
//   check     the first 20 bits of sha256(sign DER ‖ wrap DER), most
//             significant first, as four characters of the alphabet
//   reply     u16be n ‖ header(n) JSON {identity_id, long_pub, eph_pub} ‖ iv(12)
//             ‖ wrapKey(pkcs8 of the long key) under
//             HKDF(ECDH(eph, wrap_pub) ‖ secret, info "<domain>\nreply"),
//             additional data "<domain>\nreply\n<lookup>\n" ‖ sha256(sign ‖ wrap)
//             ‖ header
//
// The reply is sealed to the new device's wrapping key and not to the code
// alone because GET /sessions/:lookup_id hands the reply to anybody holding
// the code: sealed to the code, whoever heard it read out would open the long
// key too. The check digest in the additional data ties the reply to the pair
// the person compared on both screens.
//
// And the long key itself (quorum 3/3, 2026-09-26): it is held wrapped under a
// key of this process that cannot be exported — the stand-in for the vault key
// until depth has a volume — and becomes extractable only inside the call that
// seals it into a reply. Rejected: keeping it extractable for the whole life of
// the process, which protects no worse against code running in it but undoes
// the paper-code decision (the working copy is the one that cannot be
// exported) and is not what the web will do.

import { argon2id } from "hash-wasm";
import { PIN_ITERATIONS, PIN_MEMORY_KIB, PIN_PARALLELISM } from "./pin.ts";
import { ALPHABET, readPaperText } from "./paper.ts";
import { base64url } from "./sign.ts";
import { fromBase64url } from "./seal.ts";

const LENGTH = 9;
export const DOMAIN = "xor.ad/device-link/v1";
const text = (s: string) => new TextEncoder().encode(s);
const SALT = text(DOMAIN);
const GCM = { name: "AES-GCM", length: 256 } as const;
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
// What the claimant calls itself is theirs to write and nobody's to trust
// (§8.2 "назвалось"); the node keeps 200 characters of it, the screen fewer.
const LABEL_MAX = 200;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

// Every character from its own random byte, as the paper code is made.
export function newTransferCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(LENGTH))].map((b) => ALPHABET[b & 31]).join("");
}

export function readTransferCode(typed: string): string {
  const clean = readPaperText(typed);
  if (clean.length !== LENGTH || [...clean].some((c) => !ALPHABET.includes(c))) {
    throw new Error(`the transfer code is ${LENGTH} characters of ${ALPHABET}`);
  }
  return clean;
}

// Three groups of three: K7Q - M3F - 2X9, as §8.2 draws it.
export function transferGroups(code: string): string[] {
  const clean = readTransferCode(code);
  return [0, 3, 6].map((at) => clean.slice(at, at + 3));
}

export interface TransferKeys {
  lookupId: string;
  secret: Uint8Array;
}

export async function deriveTransferCode(code: string): Promise<TransferKeys> {
  const material = await argon2id({
    password: text(readTransferCode(code)),
    salt: SALT,
    parallelism: PIN_PARALLELISM,
    iterations: PIN_ITERATIONS,
    memorySize: PIN_MEMORY_KIB,
    hashLength: 64,
    outputType: "binary",
  });
  return { lookupId: base64url(material.slice(0, 32)), secret: material.slice(32, 64) };
}

// What the new device puts in its envelope: the two public halves it made for
// itself, and a name for itself nobody can check.
export interface Claimant {
  sign_pub: string;
  wrap_pub: string;
  label: string;
}

const claimData = (keys: TransferKeys) => text(`${DOMAIN}\nclaim\n${keys.lookupId}`);

async function gcmKey(secret: Uint8Array, use: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", secret as BufferSource, GCM, false, use);
}

export async function sealClaim(keys: TransferKeys, claimant: Claimant): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = text(JSON.stringify({
    sign_pub: claimant.sign_pub, wrap_pub: claimant.wrap_pub, label: claimant.label.slice(0, LABEL_MAX),
  }));
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: claimData(keys) } as AesGcmParams,
    await gcmKey(keys.secret, ["encrypt"]),
    body as BufferSource,
  ));
  return base64url(concat(iv, sealed));
}

// Opening the claim is what proves the code was typed right (§8.2): a wrong
// code or a tampered envelope throws here, and nothing is shown to a person.
export async function openClaim(keys: TransferKeys, envelope: string): Promise<Claimant> {
  const bytes = fromBase64url(envelope);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: claimData(keys) } as AesGcmParams,
    await gcmKey(keys.secret, ["decrypt"]),
    bytes.slice(12) as BufferSource,
  );
  const body = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
  const { sign_pub, wrap_pub, label } = body;
  if (typeof sign_pub !== "string" || typeof wrap_pub !== "string" || typeof label !== "string") {
    throw new Error("the claim envelope does not carry sign_pub, wrap_pub and label");
  }
  // Both halves must be keys, or the check characters would be computed over
  // something the approval then hands the node as a key.
  await crypto.subtle.importKey("spki", fromBase64url(sign_pub) as BufferSource, P256, false, ["verify"]);
  await crypto.subtle.importKey("spki", fromBase64url(wrap_pub) as BufferSource, ECDH, false, []);
  return { sign_pub, wrap_pub, label: label.slice(0, LABEL_MAX) };
}

async function checkDigest(claimant: Pick<Claimant, "sign_pub" | "wrap_pub">): Promise<Uint8Array> {
  return await sha256(concat(fromBase64url(claimant.sign_pub), fromBase64url(claimant.wrap_pub)));
}

// The four characters both screens show beside "it is me" (§8.2, SEC-5): a
// check for the eye, not a proof — somebody talked into pressing is not saved
// by them, somebody who typed the code first over a shoulder is caught.
export async function checkCharacters(claimant: Pick<Claimant, "sign_pub" | "wrap_pub">): Promise<string> {
  const d = await checkDigest(claimant);
  const bits = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4);
  return [15, 10, 5, 0].map((shift) => ALPHABET[(bits >> shift) & 31]).join("");
}

// The long key under a key of this process that cannot be exported. The
// extractable copy exists only inside `use`, and only the two calls that wrap
// it — holding it and sealing a reply — ever call `use`.
export class HeldKey {
  private constructor(private readonly key: CryptoKey, private readonly blob: Uint8Array) {}

  static async hold(extractable: CryptoKey): Promise<HeldKey> {
    const key = await crypto.subtle.generateKey(GCM, false, ["wrapKey", "unwrapKey"]) as CryptoKey;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.wrapKey("pkcs8", extractable, key, { name: "AES-GCM", iv }));
    return new HeldKey(key, concat(iv, sealed));
  }

  async #unwrap(extractable: boolean): Promise<CryptoKey> {
    return await crypto.subtle.unwrapKey(
      "pkcs8", this.blob.slice(12) as BufferSource, this.key, { name: "AES-GCM", iv: this.blob.slice(0, 12) },
      P256, extractable, ["sign"],
    );
  }

  // The copy that signs, and cannot be exported.
  signing(): Promise<CryptoKey> {
    return this.#unwrap(false);
  }

  async use<T>(fn: (extractable: CryptoKey) => Promise<T>): Promise<T> {
    return await fn(await this.#unwrap(true));
  }
}

export interface Traveller {
  identityId: string;
  longPub: string;
}

async function replyKey(shared: ArrayBuffer, secret: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", concat(new Uint8Array(shared), secret) as BufferSource, "HKDF", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: text(`${DOMAIN}\nreply`) },
    ikm, GCM, false, ["wrapKey", "unwrapKey"],
  );
}

async function replyData(keys: TransferKeys, claimant: Claimant, header: Uint8Array): Promise<Uint8Array> {
  return concat(text(`${DOMAIN}\nreply\n${keys.lookupId}\n`), await checkDigest(claimant), header);
}

// The old device, after "it is me": the long key sealed to the new device's
// wrapping key and the code's secret half together.
export async function sealReply(
  keys: TransferKeys,
  claimant: Claimant,
  who: Traveller,
  long: Pick<HeldKey, "use">,
): Promise<string> {
  const eph = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]) as CryptoKeyPair;
  const theirs = await crypto.subtle.importKey("spki", fromBase64url(claimant.wrap_pub) as BufferSource, ECDH, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, eph.privateKey, 256);
  const header = text(JSON.stringify({
    identity_id: who.identityId,
    long_pub: who.longPub,
    eph_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", eph.publicKey))),
  }));
  if (header.length > 0xffff) throw new Error("the reply header does not fit its length field");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await replyKey(shared, keys.secret);
  const additionalData = await replyData(keys, claimant, header);
  const sealed = await long.use(async (extractable) =>
    new Uint8Array(await crypto.subtle.wrapKey("pkcs8", extractable, wrapKey, { name: "AES-GCM", iv, additionalData } as AesGcmParams))
  );
  return base64url(concat(new Uint8Array([header.length >> 8, header.length & 0xff]), header, iv, sealed));
}

// The new device: the long key out of the reply, checked against the public
// half the header names by a signature it must verify, and held at once.
export async function openReply(
  keys: TransferKeys,
  mine: Claimant,
  wrapPrivate: CryptoKey,
  envelope: string,
): Promise<Traveller & { long: HeldKey; signing: CryptoKey }> {
  const bytes = fromBase64url(envelope);
  // The header is read before anything is authenticated, and whoever wrote
  // the reply — the node or the approving device — chose its bytes. So a
  // short or broken reply is refused in fixed words: a parser's message
  // quotes its input, escapes and all, and that input is theirs (review
  // panel 2026-09-26, F3 F18). 12 is the iv, 16 the GCM tag.
  const n = bytes.length >= 2 ? (bytes[0] << 8) | bytes[1] : 0;
  if (bytes.length < 2 + n + 12 + 16) throw new Error("the reply is shorter than its own header says");
  const header = bytes.slice(2, 2 + n);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(header)) as Record<string, unknown>;
  } catch {
    throw new Error("the reply header is not JSON");
  }
  const { identity_id, long_pub, eph_pub } = parsed ?? {};
  if (typeof identity_id !== "string" || typeof long_pub !== "string" || typeof eph_pub !== "string") {
    throw new Error("the reply header does not carry identity_id, long_pub and eph_pub");
  }
  const theirs = await crypto.subtle.importKey("spki", fromBase64url(eph_pub) as BufferSource, ECDH, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, wrapPrivate, 256);
  const iv = bytes.slice(2 + n, 14 + n);
  const extractable = await crypto.subtle.unwrapKey(
    "pkcs8", bytes.slice(14 + n) as BufferSource, await replyKey(shared, keys.secret),
    { name: "AES-GCM", iv, additionalData: await replyData(keys, mine, header) } as AesGcmParams,
    P256, true, ["sign"],
  );
  const probe = text(`${DOMAIN}\nprobe`);
  const publicKey = await crypto.subtle.importKey("spki", fromBase64url(long_pub) as BufferSource, P256, false, ["verify"]);
  if (!await crypto.subtle.verify(SIGN, publicKey, await crypto.subtle.sign(SIGN, extractable, probe), probe)) {
    throw new Error("the long key in the reply is not the one its header names");
  }
  const long = await HeldKey.hold(extractable);
  return { identityId: identity_id, longPub: long_pub, long, signing: await long.signing() };
}
