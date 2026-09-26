// The lock after five minutes without input (docs/depth-client_RU.md §, the
// paragraph of 2026-09-17), and the vault key that seals what the process holds
// while it is locked.
//
// A terminal left open in tmux is open to whoever sits down. After IDLE_MS
// without a key the screen is wiped to one line, the rooms are closed, and the
// core answers no signed call but the one that opens it again: POST
// /vault/share, the node's half of the vault key against a proof of the PIN.
// The node counts the attempts (chat spec §8.2), so a guess here costs what a
// guess at start-up costs.
//
// The vault key is HKDF(local ‖ share) — the local half of the PIN's Argon2id
// material, which never leaves the device, and the share the node hands back
// only against the proof (§8.2). Under it the core seals the bytes it can:
// the long key's extractable copy (a move seals it into a reply) and the long
// key wrapped under the paper code. What WebCrypto made non-extractable — the
// session's signing key, the wrapping pair, the conversations' direction keys
// — cannot be written down and so cannot be sealed; it stays in the process
// behind the gate. The gate is the lock; the seal is what more the memory can
// give up. Both are named in Client.lock's answer.

import { derivePin } from "./pin.ts";

// Five minutes without input (depth-client §, 2026-09-17; the storefronts' screen 12).
export const IDLE_MS = 5 * 60_000;

const SALT = new TextEncoder().encode("depth.vault");
const INFO = new TextEncoder().encode("lock");
const GCM = { name: "AES-GCM", length: 256 };

// Fires once after `ms` with no touch; every touch starts the wait over. The
// clock is a parameter so a test does not sit through five minutes.
export class IdleTimer {
  #handle: unknown = null;
  #stopped = false;

  constructor(
    private readonly onIdle: () => void,
    private readonly ms: number = IDLE_MS,
    private readonly clock: {
      setTimeout: (fn: () => void, ms: number) => unknown;
      clearTimeout: (handle: unknown) => void;
    } = {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  ) {
    this.touch();
  }

  // A key was pressed: the five minutes start again.
  touch(): void {
    if (this.#stopped) return;
    if (this.#handle !== null) this.clock.clearTimeout(this.#handle);
    this.#handle = this.clock.setTimeout(() => {
      this.#handle = null;
      if (!this.#stopped) this.onIdle();
    }, this.ms);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#handle !== null) this.clock.clearTimeout(this.#handle);
    this.#handle = null;
  }
}

// HKDF-SHA256(local ‖ share) → AES-256-GCM, not extractable. Both halves are 32
// bytes; the concatenation is the spec's (§8.2, "HKDF(местная доля ‖ доля узла)").
export async function vaultKey(local: Uint8Array, share: Uint8Array): Promise<CryptoKey> {
  if (local.length === 0 || share.length === 0) throw new Error("the vault key needs both halves");
  const ikm = new Uint8Array(local.length + share.length);
  ikm.set(local, 0);
  ikm.set(share, local.length);
  const material = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
    material,
    GCM,
    false,
    ["encrypt", "decrypt"],
  );
}

// The PIN's local half for the vault key, from the same derivation the proof
// comes from (pin.ts): one Argon2id run gives both.
export async function localHalf(pin: string, deviceSalt: Uint8Array): Promise<{ auth: Uint8Array; local: Uint8Array }> {
  return await derivePin(pin, deviceSalt);
}

// iv ‖ ciphertext. A fresh 96-bit nonce each time: the key seals one blob per lock.
export async function seal(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv, 0);
  out.set(sealed, iv.length);
  return out;
}

export async function open(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < 12 + 16) throw new Error("the sealed blob is too short to hold a nonce and a tag");
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(0, 12) }, key, sealed.slice(12) as BufferSource),
  );
}

// What the core puts away while locked, as one JSON document of base64url
// fields — the shape is the core's own and goes nowhere.
export interface Sealable {
  longPkcs8?: string;
  wrappedLongKey?: string;
}

export function encodeSealable(s: Sealable): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(s));
}

export function decodeSealable(bytes: Uint8Array): Sealable {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Sealable;
  if (typeof parsed !== "object" || parsed === null) throw new Error("the sealed document is not an object");
  return parsed;
}
