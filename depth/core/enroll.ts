// A new identity on this device, as the faces with a disk make it (web vault.ts
// registerAndKeep, the app's register): the client registers, the PIN is
// derived again for the local half and for the node's share, and the long key
// and the wrapping pair are sealed under the storage key (lock.ts vaultKey) into
// the record a face keeps. Keeping the record and arming the reload grace are
// the face's own (IndexedDB there); this is everything before that.
//
//   material = Argon2id(PIN, device salt)          pin.ts
//   auth     → POST /vault/share (the node checks it and counts the misses)
//   local    → never leaves; storage key = HKDF(local ‖ share)
import { Client, type HeldLongKey, WRAP_ALGORITHM } from "./client.ts";
import { open as unseal, seal, vaultKey } from "./lock.ts";
import { derivePin } from "./pin.ts";
import { fromBase64url } from "./seal.ts";
import { base64url } from "./sign.ts";
import { HeldKey } from "./transfer.ts";

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
export async function checkOf(wrapPrivate: CryptoKey): Promise<Uint8Array> {
  const point = await crypto.subtle.importKey("jwk", CHECK_POINT_JWK, WRAP_ALGORITHM, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: point }, wrapPrivate, 256));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bits));
}

/**
 * A registered client and the record this device keeps of it. The paper code is
 * the caller's to show and to ask back; it is not written anywhere here. `local`
 * is the PIN's local half, for the face's reload grace; `share` the node's half.
 * The caller wipes what it does not keep.
 */
export async function registerIdentity(
  client: Client,
  who: { name: string; age: number },
  secrets: { pin: string; paperCode: string },
): Promise<{ client: Client; record: Record_; share: Uint8Array; local: Uint8Array }> {
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
  return { client, record, share, local: pin.local };
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

/** The long key out of its seal, into memory non-extractable. */
export async function unsealLong(record: Record_, key: CryptoKey): Promise<CryptoKey> {
  const pkcs8 = await unseal(key, record.sealedLong);
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, P256, false, ["sign"]);
  } finally {
    pkcs8.fill(0);
  }
}
