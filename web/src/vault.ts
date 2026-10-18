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

import { type Answer, Client, WRAP_ALGORITHM } from "../../depth/core/client.ts";
import { raise as raiseByCode, type Outcome } from "../../depth/core/recovery.ts";
import { open as unseal, seal, vaultKey } from "../../depth/core/lock.ts";
import { derivePin } from "../../depth/core/pin.ts";
import { base64url } from "../../depth/core/sign.ts";
import { HeldKey } from "../../depth/core/transfer.ts";
import { type Arriving, createArrive, sessionSpkiOf } from "../../depth/web-platform/arrive_keep.ts";
import { checkOf, openSealed, type Record_ } from "../../depth/core/enroll.ts";
import { type Opened } from "../../depth/core/unlock.ts";
import { createKeep } from "../../depth/web-platform/vault_keep.ts";
import * as grace from "../../depth/core/grace.ts";
import { API_KEY, NODE_BASE } from "./config.ts";
import { say } from "./locales/say.ts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

// The record this device keeps (depth/core/enroll.ts: the core makes it, the face stores it).
export type { Record_ };

// ── Where the record lives and how it opens: shared with the app shell (depth/web-platform/) ──
// The IndexedDB scheme ("xor-vault" v2: identity, grace), the reload grace bound to this tab's stores, and
// the two ways of opening after a reload (PIN, grace) are the platform's — one copy for both faces, so an
// identity made by either opens in the other. What is the web's own stays below.
// The grace's wait is a parameter of the stand's build (VITE_STAND=1) as idle.ts's is:
// sessionStorage "xor-grace-ms"; a real page never reads it.
function graceMsOf(): number {
  if (import.meta.env.VITE_STAND !== "1") return grace.GRACE_MS;
  const given = Number(sessionStorage.getItem("xor-grace-ms") ?? "");
  return Number.isFinite(given) && given >= 0 ? given : grace.GRACE_MS;
}
const keep = createKeep({ node: { base: NODE_BASE, key: API_KEY }, graceMs: graceMsOf });
export const { readRecord, forget, stampGrace, dropGrace, leavingWithGrace, returningWithGrace, hiddenWithGrace, unlockByGrace } = keep;
const { armGrace, putRecord } = keep;

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// A registered client and the record this device keeps of it (depth/web-platform/vault_keep.ts: the registration
// is the core's, enroll.ts registerIdentity; keeping it on this disk and arming the reload grace are the
// platform's, shared with the app shell). The paper code is the caller's to show and to ask back; it is not
// written anywhere here.
export const registerAndKeep = keep.registerAndKeep;

// Proof that a sealed long key opens under the same PIN and share (the core's, enroll.ts openSealed):
// exercised by the e2e run right after registration, while the share is still in hand.
export { openSealed };


// The node's answer to a wrong PIN, as the unlock screen shows it: attempts
// left, or the lock — the counter is the node's (chat spec §8.2).
export class PinRefused extends Error {
  constructor(public readonly code: string, public readonly attemptsLeft?: number, public readonly retryAfter?: number) {
    super(code === "pin_locked" ? say("web.vault.pinLocked") : say("web.vault.pinWrong"));
  }
}

// After a reload: the PIN, the unlock key's one signed call for the share, the storage key, the long key
// unwrapped into memory non-extractable, and a seated client (depth/core/unlock.ts — the same for the app
// shell). The record is read here; the caller shows the screen.
export async function unlockAfterReload(record: Record_, pin: string): Promise<Opened> {
  const r = await keep.unlockAfterReload(record, pin);
  if (!r.ok) throw new PinRefused(r.code, r.attemptsLeft, r.retryAfter);
  return r.opened;
}

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
  // A device raised by the paper code keeps its session key under the same
  // seal; left under the old key it locks the vault after the next reload.
  const sessionPkcs8 = record.sealedSession ? await unseal(oldKey, record.sealedSession) : null;
  before.auth.fill(0);
  before.local.fill(0);
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
      ...(sessionPkcs8 ? { sealedSession: await seal(newKey, sessionPkcs8) } : {}),
      savedAt: Date.now(),
    };
    after.auth.fill(0);
    await putRecord(resealed);
    // The tab's grace held the old halves; they open nothing now.
    await dropGrace();
    await armGrace(after.local, fromBase64url(newShare.body.share));
    after.local.fill(0);
    return changed;
  } finally {
    longPkcs8.fill(0);
    wrapPkcs8.fill(0);
    sessionPkcs8?.fill(0);
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
  await putRecord(record);
  await armGrace(material.local, share);
  material.local.fill(0);
  share.fill(0);
  longExtractable = null;
  const reopened = await unseal(key, record.sealedLong);
  const longKey = await crypto.subtle.importKey("pkcs8", reopened as BufferSource, P256, false, ["sign"]);
  reopened.fill(0);
  return { client, longKey, outcome };
}

// A device the identity is arriving at by a move (T1; chat spec §8.2): the claim, the first PIN and
// the record are the platform's (depth/web-platform/arrive_keep.ts), shared with the app shell.
export type { Arriving };
export const { claimArrival, keepArrived } = createArrive({ node: { base: NODE_BASE, key: API_KEY }, putRecord, armGrace });

// After a reissue of the paper code: the long key under the new code, as the
// core now holds it (recovery.ts reissue → holdWrappedLongKey), into the
// record — a later reissue opens it from here after a reload (W6).
export async function rememberWrappedLongKey(client: Client): Promise<void> {
  const record = await readRecord();
  if (!record) return;
  const wrapped = client.wrappedLongKey;
  if (!wrapped) return;
  await putRecord({ ...record, wrappedLongKey: wrapped, savedAt: Date.now() });
}
