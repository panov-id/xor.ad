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
// What this file does not do yet, said plainly (W1):
//   - the wrapping pair (ECDH) is born non-extractable inside the core's
//     register() and cannot be sealed from here; the quorum asked for it to be
//     sealed too, which is a change to depth/core, deferred to the chat step;
//   - unlocking after a reload: the share comes from POST /vault/share, a
//     signed call, and the key that signs is the one sealed under the share.
//     The spec (§8.2, "each unlocking costs an exchange with the node") does
//     not say what signs that exchange on a cold start. Until it does, the
//     identity lives as long as the tab, as it does in depth without a volume.

import { Client, type HeldLongKey } from "../../depth/core/client.ts";
import { derivePin } from "../../depth/core/pin.ts";
import { base64url } from "../../depth/core/sign.ts";
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
  const born = await client.register(who, secrets, { hold });
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
