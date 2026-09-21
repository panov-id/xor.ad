// The node's half of the vault key, sealed so a database dump is not enough.
//
// Chat spec §8.2 states the condition this file exists to meet, and states it as
// a condition rather than a nicety: the share lies encrypted under the node's
// key, because a dump plus one copied browser profile would otherwise let the
// million six-digit PINs be tried offline, at home, for free. Neither auth_hash
// nor attempts_left helps there — both are on the node, and the attacker is not.
//
// So the key comes from the environment (VAULT_SHARE_KEY) and never from a table:
// a key that travels in the dump seals nothing. The price is named in the canon
// and is real — losing this key is losing every local history at once, the same
// price as losing the shares table, and it wants the same handling.
//
// AES-256-GCM, a fresh 12-byte nonce per share, stored as nonce ‖ ciphertext‖tag.
// GCM rather than CBC because the stored bytes are read back by a route that must
// tell "wrong key" from "tampered row", and an authenticated cipher answers that
// by itself.

import { config } from "../config.ts";

const NONCE_BYTES = 12;

let cached: CryptoKey | null = null;

export function configured(): boolean {
  return config.vaultShareKey.length > 0;
}

// The env value is turned into key material by HKDF (RFC 5869), not by a single
// hash over it.
//
// [retired] It used to be `SHA-256(VAULT_SHARE_KEY)`, justified by needing the
// same key on every node of the pool — true, and no argument for a bare hash:
// HKDF is exactly as deterministic. What the bare hash cost was named by the
// protocols lens of the review panel on 2026-09-20: if the variable ever holds
// a phrase rather than 32 random bytes, a search against a dump costs one
// SHA-256 per guess, and every share on the node opens offline. HKDF does not
// stretch either — nothing salt-and-expand does makes a weak phrase strong —
// so the other half of the fix is that the wizard now generates the value and
// refuses to deploy a node without one (relay/wizard/wizard.py).
//
// What HKDF adds here is domain separation: the salt and `info` below bind the
// derived key to this purpose, so the same environment value used for anything
// else never yields the same bytes. The salt is a constant rather than random
// for the reason the old comment gave: every node must derive the same key.
//
// **Changing any of the three inputs — the value, the salt, the info string —
// changes the key, and shares sealed under the old one stop opening.** That is
// the price of this commit, paid on 2026-09-21 while no node held a share.
const KEY_SALT = new TextEncoder().encode("xor.ad/vault-share/v1");
const KEY_INFO = new TextEncoder().encode("vault share sealing key, AES-256-GCM");

async function key(): Promise<CryptoKey> {
  if (cached) return cached;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.vaultShareKey) as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: KEY_SALT as BufferSource, info: KEY_INFO as BufferSource },
    material,
    256,
  );
  cached = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cached;
}

// Only for tests that change the environment between cases.
export function forgetVaultKey(): void {
  cached = null;
}

export async function sealShare(share: Uint8Array): Promise<Uint8Array> {
  if (!configured()) throw new Error("VAULT_SHARE_KEY is not set — a share must not be stored in the clear");
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await key(), share as BufferSource),
  );
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return out;
}

// null rather than a throw: the caller decides what a share it cannot open means,
// and on most routes that is "unavailable", not "your PIN was wrong".
export async function openShare(stored: Uint8Array): Promise<Uint8Array | null> {
  if (!configured() || stored.length <= NONCE_BYTES) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: stored.slice(0, NONCE_BYTES) },
      await key(),
      stored.slice(NONCE_BYTES) as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}
