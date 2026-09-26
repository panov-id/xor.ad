// The keys on this device (chat spec §8.2, SEC-2 of 2026-09-15): a private
// half lies in IndexedDB only sealed, under the storage key — and the storage
// key cannot be made from the disk alone:
//
//   material = Argon2id(PIN, device salt)          depth/core/pin.ts
//   auth     = material[0..32]  → POST /vault/share, the node checks it and
//                                  counts the misses (it, not this page)
//   local    = material[32..64] → never leaves
//   storage  = HKDF-SHA256(local ‖ share, salt = device salt, "xor.ad/vault/v1")
//
// What is sealed under it here: the long key's pkcs8 (AES-GCM; the spec says
// AES-KW, which WebCrypto refuses for a P-256 pkcs8 — not a multiple of eight
// bytes, the same reason paper.ts chose GCM; quorum of two, W1, 2026-09-26).
// What is not sealed, and not secret: identity id, session id, the long key's
// public half, the device salt, and the long key under the paper code — the
// paper code opens that one, nothing here does.
//
// Unlocking after a reload (W1c; quorum of three, web.2026-09-26.coldunlock):
// the share comes from POST /vault/share, a signed call, and the key that
// signs is the one sealed under the share. So the device keeps one more pair,
// the unlock pair — born non-extractable, kept in IndexedDB unsealed, its
// public half registered as unlock_pub — and the node accepts it on that one
// route and nowhere else (db/063, lib/identity_guard.ts). A stolen disk can
// ask for the share; it cannot get it without the PIN, and it cannot sign
// anything else.
//
// What this file does not do yet, said plainly: the wrapping pair (ECDH) is
// born non-extractable inside the core's register() and cannot be sealed
// from here; the quorum asked for it to be sealed too, which is a change to
// depth/core, deferred to the chat step. After a reload the seat gets a fresh
// wrapping pair, so a chat started before the reload cannot be opened.

import { Client, type HeldLongKey } from "../../depth/core/client.ts";
import { derivePin } from "../../depth/core/pin.ts";
import { base64url, type SigningKey } from "../../depth/core/sign.ts";
import { HeldKey } from "../../depth/core/transfer.ts";
import { API_KEY, NODE_BASE } from "./config.ts";

const DB = "xor-vault";
const STORE = "identity";
const INFO = new TextEncoder().encode("xor.ad/vault/v1");
const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

export interface Record_ {
  id: "me";
  identityId: string;
  sessionId: string;
  longSpki: string;
  deviceSalt: Uint8Array;
  // The long key under the paper code, as POST /recovery/confirm took it.
  wrappedLongKey: Uint8Array;
  // iv(12) ‖ AES-GCM(pkcs8 of the long key) under the storage key.
  sealedLong: Uint8Array;
  // The unlock pair's private half, non-extractable, unsealed: it signs
  // POST /vault/share and nothing the node accepts elsewhere (db/063).
  unlockKey: CryptoKey;
  unlockSpki: string;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) =>
    new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

export const readRecord = (): Promise<Record_ | undefined> => tx("readonly", (s) => s.get("me") as IDBRequest<Record_ | undefined>);
export const forget = (): Promise<undefined> => tx("readwrite", (s) => s.delete("me") as IDBRequest<undefined>);

async function storageKey(local: Uint8Array, share: Uint8Array, deviceSalt: Uint8Array): Promise<CryptoKey> {
  const ikm = new Uint8Array(local.length + share.length);
  ikm.set(local, 0);
  ikm.set(share, local.length);
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: deviceSalt, info: INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// A registered client and the record this device keeps of it. The paper code
// is the caller's to show and to ask back; it is not written anywhere here.
export async function registerAndKeep(
  who: { name: string; age: number },
  secrets: { pin: string; paperCode: string },
): Promise<{ client: Client; record: Record_; share: Uint8Array }> {
  const client = new Client(NODE_BASE, API_KEY);
  // The long key passes through here extractable once, at registration, as
  // the spec allows (§8.13, quorum 2026-09-26) — kept only until it is sealed.
  let extractable: CryptoKey | null = null;
  const hold = async (key: CryptoKey): Promise<HeldLongKey> => {
    extractable = key;
    return await HeldKey.hold(key);
  };
  // The unlock pair: private half never extractable, public half to the node.
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const unlockSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", unlock.publicKey)));
  const born = await client.register(who, secrets, { hold, unlockPub: unlockSpki });
  // The core made the salt; the PIN is derived again here for the local half
  // and for the node's share. The node counts this as a proof, and resets its
  // counter — the PIN is fresh from the same screen.
  const deviceSalt = client.deviceSalt!;
  const pin = await derivePin(secrets.pin, deviceSalt);
  const given = await client.request<{ share: string }>("POST", "/vault/share", { auth: base64url(pin.auth) });
  if (given.status !== 200) throw new Error(`the node did not hand back its share: ${given.status}`);
  const share = fromBase64url(given.body.share);
  const key = await storageKey(pin.local, share, deviceSalt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.wrapKey("pkcs8", extractable!, key, { name: "AES-GCM", iv }));
  extractable = null;
  const sealedLong = new Uint8Array(12 + sealed.length);
  sealedLong.set(iv, 0);
  sealedLong.set(sealed, 12);
  const record: Record_ = {
    id: "me",
    identityId: client.identityId,
    sessionId: born.sessionId,
    longSpki: client.longSpki,
    deviceSalt,
    wrappedLongKey: client.wrappedLongKey!,
    sealedLong,
    unlockKey: unlock.privateKey,
    unlockSpki,
    savedAt: Date.now(),
  };
  await tx("readwrite", (s) => s.put(record));
  return { client, record, share };
}

// Proof that a sealed long key opens under the same PIN and share — the check
// the unlock screen will make once the spec says what signs the exchange. It
// is exercised by the e2e run right after registration, while the share is
// still in hand, so that the seal is known to be a seal and not a blob.
export async function openSealed(record: Record_, pin: string, share: Uint8Array): Promise<CryptoKey> {
  const material = await derivePin(pin, record.deviceSalt);
  const key = await storageKey(material.local, share, record.deviceSalt);
  return await crypto.subtle.unwrapKey(
    "pkcs8",
    record.sealedLong.slice(12),
    key,
    { name: "AES-GCM", iv: record.sealedLong.slice(0, 12) },
    P256,
    false,
    ["sign"],
  );
}


// The node's answer to a wrong PIN, as the unlock screen shows it: attempts
// left, or the lock — the counter is the node's (chat spec §8.2).
export class PinRefused extends Error {
  constructor(public readonly code: string, public readonly attemptsLeft?: number, public readonly retryAfter?: number) {
    super(code === "pin_locked" ? "десять неверных ПИНов: вход закрыт до бумажного кода" : "неверный ПИН");
  }
}

// After a reload: the PIN, the unlock key's one signed call for the share,
// the storage key, the long key unwrapped into memory non-extractable, and a
// seated client. The record is read here; the caller shows the screen.
export async function unlockAfterReload(record: Record_, pin: string): Promise<{ client: Client; longKey: CryptoKey }> {
  const material = await derivePin(pin, record.deviceSalt);
  // A client seated with the unlock key as its session key: it can sign
  // exactly what the node lets that key sign. The long-key and wrapping slots
  // are filled with the same key and a throwaway pair — nothing reads them
  // before the real seat below.
  const asking = new Client(NODE_BASE, API_KEY);
  const throwaway = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
  const unlockSigning: SigningKey = { privateKey: record.unlockKey, publicSpki: record.unlockSpki };
  asking.seat({
    identityId: record.identityId,
    sessionId: record.sessionId,
    sessionKey: unlockSigning,
    longKey: record.unlockKey,
    longSpki: record.unlockSpki,
    wrapPrivate: throwaway.privateKey,
  });
  const given = await asking.request<{ share?: string; error?: { code?: string; attempts_left?: number } }>(
    "POST", "/vault/share", { auth: base64url(material.auth) },
  );
  if (given.status !== 200 || !given.body?.share) {
    const code = given.body?.error?.code ?? `status_${given.status}`;
    throw new PinRefused(code, given.body?.error?.attempts_left, given.retryAfter);
  }
  const key = await storageKey(material.local, fromBase64url(given.body.share), record.deviceSalt);
  const long = await crypto.subtle.unwrapKey(
    "pkcs8",
    record.sealedLong.slice(12),
    key,
    { name: "AES-GCM", iv: record.sealedLong.slice(0, 12) },
    P256,
    false,
    ["sign"],
  );
  const client = new Client(NODE_BASE, API_KEY);
  const longSigning: SigningKey = { privateKey: long, publicSpki: record.longSpki };
  // The wrapping pair is not on the disk yet (see the top of this file): a
  // fresh one, which means no chat from before the reload opens.
  const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
  client.seat({
    identityId: record.identityId,
    sessionId: record.sessionId,
    sessionKey: longSigning,
    longKey: long,
    longSpki: record.longSpki,
    wrapPrivate: wrap.privateKey,
    deviceSalt: record.deviceSalt,
    wrappedLongKey: record.wrappedLongKey,
  });
  // The signing half goes back too: the chat keys sign with it (chat/keys.ts).
  return { client, longKey: long };
}
