// The keys on this device (chat spec §8.2, SEC-2 of 2026-09-15): a private
// half lies in IndexedDB only sealed, under the storage key — and the storage
// key cannot be made from the disk alone:
//
//   material = Argon2id(PIN, device salt)          depth/core/pin.ts
//   auth     = material[0..32]  → POST /vault/share, the node checks it and
//                                  counts the misses (it, not this page)
//   local    = material[32..64] → never leaves
//   storage  = HKDF-SHA256(local ‖ share) — depth/core/lock.ts vaultKey, the
//              one derivation both faces use (§8.2: the web and depth are the
//              same; P4 gave the core its own lock on 2026-09-26)
//
// What is sealed under it here: the long key's pkcs8, by the core's seal()
// (AES-GCM; the spec says AES-KW, which WebCrypto refuses for a P-256 pkcs8 —
// not a multiple of eight bytes, the same reason paper.ts chose GCM; quorum
// of two, W1, 2026-09-26).
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
// The wrapping pair (ECDH) is sealed beside the long key (W1d, 2026-09-26):
// the core hands its pkcs8 over once at registration (register's holdWrap)
// and keeps a non-extractable copy; after a reload the same pair comes back
// from the seal, so the chat keys P2 wrapped under this session's
// wrap_public_key open again. Same seal, same vault key; the public half is
// the node's to remember (sessions.wrap_public_key).

import { type Answer, Client, type HeldLongKey, WRAP_ALGORITHM, WRAP_USAGES } from "../../depth/core/client.ts";
import { raise as raiseByCode, type Outcome } from "../../depth/core/recovery.ts";
import { open as unseal, seal, vaultKey } from "../../depth/core/lock.ts";
import { derivePin } from "../../depth/core/pin.ts";
import { base64url, type SigningKey } from "../../depth/core/sign.ts";
import { HeldKey } from "../../depth/core/transfer.ts";
import { API_KEY, NODE_BASE } from "./config.ts";

const DB = "xor-vault";
const STORE = "identity";
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
  // The session's own signing key, sealed the same way, when it is not the
  // long key: a raise by paper code on a clean device makes a fresh session
  // key (recovery.ts), and it is what signs from then on (W6).
  sealedSession?: Uint8Array;
  sessionSpki?: string;
  // The wrapping pair's private half, sealed the same way (W1d), and its
  // public half as base64url SPKI — seat() takes it, the chat keys wrap under
  // it (W3), and the node never says it back.
  sealedWrap: Uint8Array;
  wrapSpki: string;
  // What the wrapping key derives with a fixed public point: not a secret of
  // anything (the point is public and the same everywhere), and after a reload
  // the raised key must derive the same — the page's own proof that the pair
  // came back, which the e2e reads.
  wrapCheck: Uint8Array;
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

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// A fixed public point for the wrap check: the generator's own public key of
// a P-256 pair with private scalar 1 — public, constant, the same for every
// device. Deriving with it proves nothing about any peer; it tells the same
// private key from a different one.
const CHECK_POINT_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY",
  y: "T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU",
} as const;
async function checkOf(wrapPrivate: CryptoKey): Promise<Uint8Array> {
  const point = await crypto.subtle.importKey("jwk", CHECK_POINT_JWK, WRAP_ALGORITHM, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: point }, wrapPrivate, 256));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bits));
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
  // The wrapping pair's pkcs8, copied for the one seal below and wiped after.
  let wrapPkcs8: Uint8Array | null = null;
  const holdWrap = async (pkcs8: Uint8Array): Promise<void> => {
    wrapPkcs8 = pkcs8.slice();
  };
  // The unlock pair: private half never extractable, public half to the node.
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const unlockSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", unlock.publicKey)));
  const born = await client.register(who, secrets, { hold, unlockPub: unlockSpki, holdWrap });
  // The core made the salt; the PIN is derived again here for the local half
  // and for the node's share. The node counts this as a proof, and resets its
  // counter — the PIN is fresh from the same screen.
  const deviceSalt = client.deviceSalt!;
  const pin = await derivePin(secrets.pin, deviceSalt);
  const given = await client.request<{ share: string }>("POST", "/vault/share", { auth: base64url(pin.auth) });
  if (given.status !== 200) throw new Error(`the node did not hand back its share: ${given.status}`);
  const share = fromBase64url(given.body.share);
  const key = await vaultKey(pin.local, share);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", extractable!));
  extractable = null;
  const sealedLong = await seal(key, pkcs8);
  pkcs8.fill(0);
  if (!wrapPkcs8) throw new Error("the core did not hand the wrapping pair over");
  const sealedWrap = await seal(key, wrapPkcs8);
  const wrapCheck = await checkOf(await crypto.subtle.importKey("pkcs8", wrapPkcs8 as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"]));
  const wrapSpki = client.wrapPublicSpki;
  if (!wrapSpki) throw new Error("the core did not say the wrapping pair's public half");
  (wrapPkcs8 as Uint8Array).fill(0);
  wrapPkcs8 = null;
  const record: Record_ = {
    id: "me",
    identityId: client.identityId,
    sessionId: born.sessionId,
    longSpki: client.longSpki,
    deviceSalt,
    wrappedLongKey: client.wrappedLongKey!,
    sealedLong,
    sealedWrap,
    wrapSpki,
    wrapCheck,
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
  try {
    return await unsealLong(record, await vaultKey(material.local, share));
  } finally {
    material.auth.fill(0);
    material.local.fill(0);
  }
}

// The long key out of its seal, into memory non-extractable.
async function unsealLong(record: Record_, key: CryptoKey): Promise<CryptoKey> {
  const pkcs8 = await unseal(key, record.sealedLong);
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, P256, false, ["sign"]);
  } finally {
    pkcs8.fill(0);
  }
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
export async function unlockAfterReload(record: Record_, pin: string): Promise<{ client: Client; longKey: CryptoKey; wrapSame: boolean }> {
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
  material.auth.fill(0);
  if (given.status !== 200 || !given.body?.share) {
    material.local.fill(0);
    const code = given.body?.error?.code ?? `status_${given.status}`;
    throw new PinRefused(code, given.body?.error?.attempts_left, given.retryAfter);
  }
  const share = fromBase64url(given.body.share);
  // One vault key for both seals, and the halves wiped once both are open
  // (verifier of W1c): a wipe between the two left the wrapping pair sealed
  // under a key made of zeros — the first red run after the merge of W1d.
  let long: CryptoKey;
  let session: CryptoKey | null = null;
  let wrapPrivate: CryptoKey;
  try {
    const key = await vaultKey(material.local, share);
    long = await unsealLong(record, key);
    if (record.sealedSession) {
      const sessionPkcs8 = await unseal(key, record.sealedSession);
      try {
        session = await crypto.subtle.importKey("pkcs8", sessionPkcs8 as BufferSource, P256, false, ["sign"]);
      } finally {
        sessionPkcs8.fill(0);
      }
    }
    const wrapPkcs8 = await unseal(key, record.sealedWrap);
    try {
      wrapPrivate = await crypto.subtle.importKey("pkcs8", wrapPkcs8 as BufferSource, WRAP_ALGORITHM, false, WRAP_USAGES);
    } finally {
      wrapPkcs8.fill(0);
    }
  } finally {
    material.local.fill(0);
    share.fill(0);
  }
  const client = new Client(NODE_BASE, API_KEY);
  const longSigning: SigningKey = { privateKey: long, publicSpki: record.longSpki };
  // The key that signs: the session's own after a raise, the long key after
  // a registration (there they are one key).
  const sessionSigning: SigningKey = session ? { privateKey: session, publicSpki: record.sessionSpki ?? record.longSpki } : longSigning;
  // The same wrapping pair as before the reload, out of its seal (W1d).
  const same = equal(await checkOf(wrapPrivate), record.wrapCheck);
  client.seat({
    identityId: record.identityId,
    sessionId: record.sessionId,
    sessionKey: sessionSigning,
    longKey: long,
    longSpki: record.longSpki,
    wrapPrivate,
    wrapPublicSpki: record.wrapSpki,
    deviceSalt: record.deviceSalt,
    wrappedLongKey: record.wrappedLongKey,
  });
  // The signing half goes back too: the chat keys sign with it (chat/keys.ts).
  return { client, longKey: long, wrapSame: same };
}

const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// Changing the PIN re-seals the vault (W4, 2026-09-26): the vault key is
// HKDF(local ‖ share), and POST /vault/pin gives the node a new auth and a
// new share — after it, the old seal opens with nothing this device can
// derive. So, in order: the old halves are proved and the seals opened
// (POST /vault/share with the old proof, signed by the seated session), the
// PIN is changed through the core, the new share is fetched with the new
// proof, and both keys are sealed again. Between the change and the new
// seal the old blobs stay on the disk; a crash there is the paper code's
// case, as it is for a lost device. The core's counter answers a wrong old
// PIN before anything is opened.
export async function changePinAndReseal(client: Client, current: string, next: string): Promise<Answer<{ error?: { code?: string; attempts_left?: number } }>> {
  const record = await readRecord();
  if (!record) throw new Error("this device keeps no identity to re-seal");
  const before = await derivePin(current, record.deviceSalt);
  const oldShare = await client.request<{ share?: string; error?: { code?: string; attempts_left?: number } }>(
    "POST", "/vault/share", { auth: base64url(before.auth) },
  );
  if (oldShare.status !== 200 || !oldShare.body?.share) return oldShare as Answer<{ error?: { code?: string; attempts_left?: number } }>;
  const oldKey = await vaultKey(before.local, fromBase64url(oldShare.body.share));
  const longPkcs8 = await unseal(oldKey, record.sealedLong);
  const wrapPkcs8 = await unseal(oldKey, record.sealedWrap);
  try {
    const changed = await client.changePin(current, next);
    if (changed.status !== 200) return changed;
    const after = await derivePin(next, record.deviceSalt);
    const newShare = await client.request<{ share?: string }>("POST", "/vault/share", { auth: base64url(after.auth) });
    if (newShare.status !== 200 || !newShare.body?.share) throw new Error(`the node did not hand back its new share: ${newShare.status}`);
    const newKey = await vaultKey(after.local, fromBase64url(newShare.body.share));
    const resealed: Record_ = {
      ...record,
      sealedLong: await seal(newKey, longPkcs8),
      sealedWrap: await seal(newKey, wrapPkcs8),
      savedAt: Date.now(),
    };
    await tx("readwrite", (s) => s.put(resealed));
    return changed;
  } finally {
    longPkcs8.fill(0);
    wrapPkcs8.fill(0);
  }
}

// A clean device raised by the paper code (W6; chat spec §8.2, depth/ink
// restore): the code opens the long key the node kept wrapped, a fresh
// session key and wrapping pair are born — handed over once as pkcs8 — and a
// first PIN takes the grant the claim left (POST /vault/init). Then the record
// is sealed exactly as after a registration, plus the session key.
export async function raiseAndKeep(
  code: string,
  pin: string,
): Promise<{ client: Client; longKey: CryptoKey; outcome: Outcome } | { outcome: Outcome }> {
  const client = new Client(NODE_BASE, API_KEY);
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const unlockSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", unlock.publicKey)));
  let longExtractable: CryptoKey | null = null;
  let sessionPkcs8: Uint8Array | null = null;
  let wrapPkcs8: Uint8Array | null = null;
  const outcome = await raiseByCode(client, code, {
    hold: async (key) => {
      longExtractable = key;
      return await HeldKey.hold(key);
    },
    holdSession: async (pkcs8) => { sessionPkcs8 = pkcs8.slice(); },
    holdWrap: async (pkcs8) => { wrapPkcs8 = pkcs8.slice(); },
    unlockPub: unlockSpki,
  });
  if (!outcome.ok) return { outcome };
  if (!longExtractable || !sessionPkcs8 || !wrapPkcs8) throw new Error("the core did not hand the keys over");
  // The first PIN on this device: the grant the claim left, and the node's
  // share with it (firstPin keeps the salt).
  const set = await client.firstPin(pin);
  if (set.status !== 200 && set.status !== 204) throw new Error(`the first PIN was refused: ${set.status} ${JSON.stringify(set.body)}`);
  const deviceSalt = client.deviceSalt!;
  const material = await derivePin(pin, deviceSalt);
  const given = await client.request<{ share: string }>("POST", "/vault/share", { auth: base64url(material.auth) });
  if (given.status !== 200) throw new Error(`the node did not hand back its share: ${given.status}`);
  const share = fromBase64url(given.body.share);
  const key = await vaultKey(material.local, share);
  const longPkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", longExtractable));
  const sessionSpki = (await sessionSpkiOf(sessionPkcs8));
  const record: Record_ = {
    id: "me",
    identityId: client.identityId,
    sessionId: client.sessionId,
    longSpki: client.longSpki,
    deviceSalt,
    wrappedLongKey: client.wrappedLongKey!,
    sealedLong: await seal(key, longPkcs8),
    sealedSession: await seal(key, sessionPkcs8),
    sessionSpki,
    sealedWrap: await seal(key, wrapPkcs8),
    wrapSpki: client.wrapPublicSpki!,
    wrapCheck: await checkOf(await crypto.subtle.importKey("pkcs8", wrapPkcs8 as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"])),
    unlockKey: unlock.privateKey,
    unlockSpki,
    savedAt: Date.now(),
  };
  longPkcs8.fill(0);
  (sessionPkcs8 as Uint8Array).fill(0);
  (wrapPkcs8 as Uint8Array).fill(0);
  material.auth.fill(0);
  material.local.fill(0);
  share.fill(0);
  longExtractable = null;
  await tx("readwrite", (s) => s.put(record));
  const longKey = await crypto.subtle.importKey("pkcs8", await unseal(key, record.sealedLong), P256, false, ["sign"]);
  return { client, longKey, outcome };
}

// The public half of an ECDSA P-256 private key from its pkcs8, base64url SPKI.
async function sessionSpkiOf(pkcs8: Uint8Array): Promise<string> {
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, P256, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const pub = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, P256, true, ["verify"]);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
}
