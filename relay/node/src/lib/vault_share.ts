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
import type { Query } from "./db.ts";

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

// The PIN's proof at rest (crypto attack review of 2026-11-02): a plain
// sha256 in the table let a dump plus one copied device test all 10^6 PINs
// offline. Under an HMAC with a key from the environment the dump alone tests
// nothing. Its own HKDF salt and info: this key seals no share.
const AUTH_PREFIX = "k1:";
const AUTH_SALT = new TextEncoder().encode("xor.ad/vault-auth-hash/v1");
const AUTH_INFO = new TextEncoder().encode("stored PIN proof, HMAC-SHA-256");
let cachedAuth: CryptoKey | null = null;

async function authKey(): Promise<CryptoKey> {
  if (cachedAuth) return cachedAuth;
  if (!configured()) throw new Error("VAULT_SHARE_KEY is not set: a PIN proof must not be stored in the clear");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.vaultShareKey) as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  cachedAuth = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: AUTH_SALT as BufferSource, info: AUTH_INFO as BufferSource },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return cachedAuth;
}

// What goes into vault_shares.auth_hash for the sha256 hex a client sent.
export async function keyedAuthHash(authHash: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await authKey(), new TextEncoder().encode(authHash));
  return AUTH_PREFIX + Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Owner 05.11.2026: PIN proofs go under the key only behind PIN_PROOF_KEYED=1. A previous tag compares a stored proof
// plainly, so while it is off a rollback lets people in. Turning it on ends that way back.
const pinProofKeyed = (): boolean => Deno.env.get("PIN_PROOF_KEYED") === "1";

// What a route stores for the proof a client sent: under the key only with the flag on.
export const storedAuthHash = (authHash: string): Promise<string> | string =>
  pinProofKeyed() ? keyedAuthHash(authHash) : authHash;

// The start's rekey: with the flag off no row changes, and null says it did not run.
export const rekeyAtStart = (run: Query): Promise<number> | null => pinProofKeyed() ? rekeyAuthHashes(run) : null;

// A row with no prefix is one written before this key, or by an older node of
// the pool during a rollout: rekeyAuthHashes takes those at every start.
export const isKeyedAuthHash = (stored: string): boolean => stored.startsWith(AUTH_PREFIX);

// The stored form of the proof as it should be compared with a row.
export const comparableAuthHash = (presented: string, stored: string): Promise<string> | string =>
  isKeyedAuthHash(stored) ? keyedAuthHash(presented) : presented;

// Every plain row goes under the key, a batch at a time, before the node takes
// requests. Guarded on the old value, so two nodes starting together are safe.
export async function rekeyAuthHashes(run: Query): Promise<number> {
  let done = 0;
  for (;;) {
    const rows = await run<{ session: string; auth_hash: string }>(
      `SELECT session, auth_hash FROM vault_shares WHERE auth_hash NOT LIKE 'k1:%' LIMIT 500`,
    );
    if (rows.length === 0) return done;
    for (const row of rows) {
      await run(`UPDATE vault_shares SET auth_hash = $2 WHERE session = $1 AND auth_hash = $3`,
        [row.session, await keyedAuthHash(row.auth_hash), row.auth_hash]);
      done++;
    }
  }
}

// Only for tests that change the environment between cases.
export function forgetVaultKey(): void {
  cached = null;
  cachedAuth = null;
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
