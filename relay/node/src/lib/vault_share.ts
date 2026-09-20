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

// The env value is a passphrase, not key material, so it is stretched rather than
// used raw: SHA-256 over it gives the 32 bytes AES-256 wants, deterministically
// across every node in the pool — which is required, since any node may answer
// the next request for the same share.
async function key(): Promise<CryptoKey> {
  if (cached) return cached;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(config.vaultShareKey),
  );
  cached = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
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
