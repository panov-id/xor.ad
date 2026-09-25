// The paper code (chat spec §8.2, "Бумажный код восстановления"): sixteen
// characters born on the device, written down once, and never seen by the node.
//
//   code     = 16 × Crockford base32 without I L O U — 80 bits
//   material = Argon2id(code, "xor.ad/recovery/v1", 64 MiB, t=3, p=1) — 64 bytes
//   lookup   = material[0..32]  → base64url, POST /identities recovery_lookup_id;
//                                  the node keeps its sha256 and finds the
//                                  identity by it
//   wrap     = material[32..64] → AES-256-GCM key the long key is wrapped under;
//                                  never leaves the device
//   wrapped  = iv(12) ‖ ciphertext ‖ tag of the long key's pkcs8, the salt as
//              additional data → POST /recovery/confirm recovery_wrapped_key
//
// The spec fixes the alphabet, the length, the salt, 64 MB and t=3. The rest —
// p, how the code is read back, the byte split, the lookup's encoding and the
// wrap — is a contract the web has to repeat for a code written in one face to
// raise the identity in the other, and it was decided by a quorum of three on
// 2026-09-26 (A5): p=1 as the PIN (pin.ts), the split of the transfer code,
// base64url as everywhere in this core, and AES-GCM because AES-KW takes only
// multiples of eight bytes and a P-256 pkcs8 is not one.

import { argon2id } from "hash-wasm";
import { PIN_ITERATIONS, PIN_MEMORY_KIB, PIN_PARALLELISM } from "./pin.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 16;
const SALT = new TextEncoder().encode("xor.ad/recovery/v1");
const GCM = { name: "AES-GCM", length: 256 } as const;

// Every character from its own random byte: 256 is 8 × 32, so the low five bits
// are uniform and nothing is rejected.
export function newPaperCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(LENGTH))].map((b) => ALPHABET[b & 31]).join("");
}

// Four groups of four, the way the screen shows it and the paper keeps it.
export function paperGroups(code: string): string[] {
  const clean = readPaperCode(code);
  return [0, 4, 8, 12].map((at) => clean.slice(at, at + 4));
}

// What a person types back: any case, dashes and spaces where they like, and
// the letters Crockford reads as digits read as digits. U is not in the
// alphabet and is refused rather than guessed, as is any other stray character.
export function readPaperCode(typed: string): string {
  const clean = typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (clean.length !== LENGTH || [...clean].some((c) => !ALPHABET.includes(c))) {
    throw new Error(`the paper code is ${LENGTH} characters of ${ALPHABET}`);
  }
  return clean;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function derivePaperCode(code: string): Promise<{ lookupId: string; wrapKey: CryptoKey }> {
  const material = await argon2id({
    password: new TextEncoder().encode(readPaperCode(code)),
    salt: SALT,
    parallelism: PIN_PARALLELISM,
    iterations: PIN_ITERATIONS,
    memorySize: PIN_MEMORY_KIB,
    hashLength: 64,
    outputType: "binary",
  });
  const wrapKey = await crypto.subtle.importKey("raw", material.slice(32, 64), GCM, false, ["wrapKey", "unwrapKey"]);
  return { lookupId: base64url(material.slice(0, 32)), wrapKey };
}

// The long key under the code, and a copy of it the process can sign with but
// never export. The extractable key goes no further than this function: its
// material is only ever handed to wrapKey, never read into a buffer here.
export async function wrapLongKey(
  extractable: CryptoKey,
  wrapKey: CryptoKey,
): Promise<{ wrapped: Uint8Array; privateKey: CryptoKey }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.wrapKey("pkcs8", extractable, wrapKey, { name: "AES-GCM", iv, additionalData: SALT } as AesGcmParams),
  );
  const wrapped = new Uint8Array(iv.length + sealed.length);
  wrapped.set(iv);
  wrapped.set(sealed, iv.length);
  return { wrapped, privateKey: await unwrapLongKey(wrapped, wrapKey) };
}

// The way back, and the check that the way back works: registration unwraps
// what it is about to hand the node, so a wrap that cannot be opened fails
// here and not a year later on somebody's clean device.
export async function unwrapLongKey(wrapped: Uint8Array, wrapKey: CryptoKey): Promise<CryptoKey> {
  return await crypto.subtle.unwrapKey(
    "pkcs8",
    wrapped.slice(12),
    wrapKey,
    { name: "AES-GCM", iv: wrapped.slice(0, 12), additionalData: SALT } as AesGcmParams,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}
