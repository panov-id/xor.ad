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

// ---- The two secrets of a rotation (owner /go 07.11.2026, "сперва делаем ротацию") ----
//
// VAULT_SHARE_KEY is what everything new is sealed, keyed and signed under.
// VAULT_SHARE_KEY_PREVIOUS, set only while a rotation runs, is the key being
// retired: what was sealed under it still opens and is moved under the current
// one — vault shares at the start (rekeyShares), PIN proofs at the next right
// PIN (pin_attempts.ts), page cursors just open until they age out. Every
// derived key keeps its own salt and info; only the input secret changes.

export type Which = "current" | "previous";

function secret(which: Which): string {
  return which === "current" ? config.vaultShareKey : config.vaultShareKeyPrevious;
}

// The previous key counts only when it is set and differs from the current one.
export function rotating(): boolean {
  return config.vaultShareKeyPrevious.length > 0 && config.vaultShareKeyPrevious !== config.vaultShareKey;
}

// The keys to try when opening, current first.
export function openingKeys(): Which[] {
  return rotating() ? ["current", "previous"] : ["current"];
}

const derivedCache = new Map<string, Promise<CryptoKey>>();

// One derived key per (secret, purpose). The cache is keyed by the secret too,
// so a test that changes the environment gets a fresh key.
export function derivedKey(which: Which, salt: Uint8Array, info: Uint8Array, algorithm: "AES-GCM" | "HMAC"): Promise<CryptoKey> {
  const value = secret(which);
  if (value.length === 0) {
    return Promise.reject(new Error(`VAULT_SHARE_KEY${which === "previous" ? "_PREVIOUS" : ""} is not set`));
  }
  const text = new TextDecoder();
  const id = [algorithm, text.decode(salt), text.decode(info), value].join("\u0000");
  let hit = derivedCache.get(id);
  if (!hit) {
    hit = (async () => {
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(value) as BufferSource, "HKDF", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, material, 256);
      return algorithm === "AES-GCM"
        ? crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"])
        : crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    })();
    derivedCache.set(id, hit);
  }
  return hit;
}

const ID_SALT = new TextEncoder().encode("xor.ad/vault-key-id/v1");
const ID_INFO = new TextEncoder().encode("public name of a vault key, HMAC-SHA-256");

// A short public name for a key, written next to what it keyed: eight hex
// characters of an HMAC under a key derived from it. It tells nothing about the key.
export async function keyId(which: Which): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await derivedKey(which, ID_SALT, ID_INFO, "HMAC"), new TextEncoder().encode("key id"));
  return hex(new Uint8Array(mac).slice(0, 4));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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
// Changing the value is a rotation (above); changing the salt or the info
// string is not, and shares sealed under the old derivation stop opening.
const KEY_SALT = new TextEncoder().encode("xor.ad/vault-share/v1");
const KEY_INFO = new TextEncoder().encode("vault share sealing key, AES-256-GCM");

// The PIN's proof at rest (crypto attack review of 2026-11-02): a plain
// sha256 in the table let a dump plus one copied device test all 10^6 PINs
// offline. Under an HMAC with a key from the environment the dump alone tests
// nothing. Its own HKDF salt and info: this key seals no share.
//
// Forms: "k2:<key id>:<mac>" names the key (written since the rotation of
// 07.11.2026); "k1:<mac>" is a row from before, under whichever single key the
// node then had; a bare hex is a row from before the keying at all.
const AUTH_SALT = new TextEncoder().encode("xor.ad/vault-auth-hash/v1");
const AUTH_INFO = new TextEncoder().encode("stored PIN proof, HMAC-SHA-256");

async function authMac(which: Which, authHash: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await derivedKey(which, AUTH_SALT, AUTH_INFO, "HMAC"), new TextEncoder().encode(authHash));
  return hex(new Uint8Array(mac));
}

// What goes into vault_shares.auth_hash for the sha256 hex a client sent.
export async function keyedAuthHash(authHash: string): Promise<string> {
  if (!configured()) throw new Error("VAULT_SHARE_KEY is not set: a PIN proof must not be stored in the clear");
  return `k2:${await keyId("current")}:${await authMac("current", authHash)}`;
}

// Owner 07.11.2026 ("нужна оч сильная", security panel plan step 3): the proof is always stored under the key. The
// PIN_PROOF_KEYED flag of 05.11 is gone, and with it the way back: a rollback to a tag without k1: refuses the right PIN.
export const storedAuthHash = (authHash: string): Promise<string> => keyedAuthHash(authHash);

// A row with no prefix is one written before the keying, or by an older node
// of the pool during a rollout: rekeyAuthHashes takes those at every start.
export const isKeyedAuthHash = (stored: string): boolean => stored.startsWith("k1:") || stored.startsWith("k2:");

// The candidates the stored row may equal, each with the key it came from.
// A k2 row names its key; a k1 row is tried under both while a rotation runs;
// a bare row is the presented hash itself.
export async function comparableAuthHashes(presented: string, stored: string): Promise<{ form: string; under: Which | "plain" }[]> {
  if (stored.startsWith("k2:")) {
    const out: { form: string; under: Which }[] = [];
    for (const which of openingKeys()) {
      const id = await keyId(which);
      if (stored.startsWith(`k2:${id}:`)) out.push({ form: `k2:${id}:${await authMac(which, presented)}`, under: which });
    }
    return out;
  }
  if (stored.startsWith("k1:")) {
    const out: { form: string; under: Which }[] = [];
    for (const which of openingKeys()) out.push({ form: `k1:${await authMac(which, presented)}`, under: which });
    return out;
  }
  return [{ form: presented, under: "plain" }];
}

// The start: every plain row goes under the key, and with no rotation running
// every k1 row is named by the current key (it was keyed by the only key the
// node had). Then every share sealed under the previous key is resealed.
export const rekeyAtStart = (run: Query): Promise<number> => rekeyAuthHashes(run);

// Owner /go 07.11.2026 (security review, step 2): a node with a database refuses to start without VAULT_SHARE_KEY, or
// when the rekey fails; it used to log and go on, and plain proofs stayed in a dump. The price: a box with the key
// forgotten does not come up at all.
export async function vaultAtStart(run: Query, hasDatabase: boolean, hasKey: boolean = configured()): Promise<number> {
  if (!hasDatabase) return 0;
  if (!hasKey) throw new Error("VAULT_SHARE_KEY is not set: the node does not start with PIN proofs it cannot key");
  try {
    const proofs = await rekeyAuthHashes(run);
    const shares = await rekeyShares(run);
    return proofs + shares.moved;
  } catch (error) {
    throw new Error(`PIN proofs could not be put under the key, the node does not start: ${String(error)}`);
  }
}

// Guarded on the old value, so two nodes starting together are safe.
export async function rekeyAuthHashes(run: Query): Promise<number> {
  let done = 0;
  for (;;) {
    const rows = await run<{ session: string; auth_hash: string }>(
      `SELECT session, auth_hash FROM vault_shares WHERE auth_hash NOT LIKE 'k_:%' LIMIT 500`,
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      await run(`UPDATE vault_shares SET auth_hash = $2 WHERE session = $1 AND auth_hash = $3`,
        [row.session, await keyedAuthHash(row.auth_hash), row.auth_hash]);
      done++;
    }
  }
  if (!rotating()) {
    const named = await run(
      `UPDATE vault_shares SET auth_hash = 'k2:' || $1 || ':' || substr(auth_hash, 4) WHERE auth_hash LIKE 'k1:%' RETURNING session`,
      [await keyId("current")],
    );
    done += named.length;
  }
  return done;
}

// The right PIN, proved under the previous key or as a k1 row, is written
// again under the current key, guarded on the old value.
export async function moveAuthHash(run: Query, session: string, presented: string, stored: string): Promise<void> {
  const next = await keyedAuthHash(presented);
  if (next !== stored) await run(`UPDATE vault_shares SET auth_hash = $2 WHERE session = $1 AND auth_hash = $3`, [session, next, stored]);
}

// What is still under the previous key, for the log and /health: PIN proofs
// that name it, and k1 rows that a rotation has not yet sorted. When it reads
// 0, VAULT_SHARE_KEY_PREVIOUS can go.
export async function previousRows(run: Query): Promise<number> {
  if (!rotating()) return 0;
  const [row] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM vault_shares WHERE auth_hash LIKE 'k1:%' OR auth_hash LIKE 'k2:' || $1 || ':%'`,
    [await keyId("previous")],
  );
  return row?.n ?? 0;
}

// Only for tests that change the environment between cases.
export function forgetVaultKey(): void {
  derivedCache.clear();
}

export async function sealShare(share: Uint8Array): Promise<Uint8Array> {
  if (!configured()) throw new Error("VAULT_SHARE_KEY is not set — a share must not be stored in the clear");
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await derivedKey("current", KEY_SALT, KEY_INFO, "AES-GCM"), share as BufferSource),
  );
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return out;
}

// Which key opens a share, and what it holds. GCM tells a foreign key from
// its own, so the stored layout carries no key name.
export async function openShareWith(stored: Uint8Array): Promise<{ plain: Uint8Array; under: Which } | null> {
  if (!configured() || stored.length <= NONCE_BYTES) return null;
  for (const which of openingKeys()) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: stored.slice(0, NONCE_BYTES) },
        await derivedKey(which, KEY_SALT, KEY_INFO, "AES-GCM"),
        stored.slice(NONCE_BYTES) as BufferSource,
      );
      return { plain: new Uint8Array(plain), under: which };
    } catch {
      // the next key
    }
  }
  return null;
}

// null rather than a throw: the caller decides what a share it cannot open means,
// and on most routes that is "unavailable", not "your PIN was wrong".
export async function openShare(stored: Uint8Array): Promise<Uint8Array | null> {
  return (await openShareWith(stored))?.plain ?? null;
}

// While a rotation runs, every share sealed under the previous key is sealed
// again under the current one, a page at a time, guarded on the old bytes.
// `lost` counts shares neither key opens: they were under a third key.
export async function rekeyShares(run: Query): Promise<{ moved: number; lost: number }> {
  let moved = 0;
  let lost = 0;
  if (!rotating()) return { moved, lost };
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await run<{ session: string; share_enc: Uint8Array }>(
      `SELECT session::text AS session, share_enc FROM vault_shares
        WHERE share_enc IS NOT NULL AND session > $1::uuid ORDER BY session LIMIT 500`,
      [after],
    );
    if (rows.length === 0) return { moved, lost };
    for (const row of rows) {
      after = row.session;
      const opened = await openShareWith(row.share_enc);
      if (!opened) {
        lost++;
        continue;
      }
      if (opened.under === "current") continue;
      await run(`UPDATE vault_shares SET share_enc = $2 WHERE session = $1::uuid AND share_enc = $3`,
        [row.session, await sealShare(opened.plain), row.share_enc]);
      moved++;
    }
  }
}
