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
import { Arrival } from "../../depth/core/transfer_move.ts";
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

// Changing the PIN re-seals the vault: the platform's, shared with the app shell (vault_keep.ts, 18.10.2026).
export const changePinAndReseal = keep.changePinAndReseal;

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

// A device the identity is arriving at by a move (T1; chat spec §8.2): the
// claim goes with an unlock key and hands the session key's and the wrapping
// pair's pkcs8 over once; after "it is me" on the old device the core seats
// the client with the long key held, and a first PIN seals the record exactly
// as after a raise by the paper code.
export interface Arriving {
  arrival: Arrival;
  client: Client;
  unlock: CryptoKeyPair;
  unlockSpki: string;
  sessionPkcs8: Uint8Array | null;
  wrapPkcs8: Uint8Array | null;
}

export async function claimArrival(code: string, label: string): Promise<Arriving | Answer> {
  const client = new Client(NODE_BASE, API_KEY);
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const unlockSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", unlock.publicKey)));
  const kept: { session: Uint8Array | null; wrap: Uint8Array | null } = { session: null, wrap: null };
  const arrival = await Arrival.claim(client, code, label, {
    unlockPub: unlockSpki,
    holdSession: async (pkcs8) => { kept.session = pkcs8.slice(); },
    holdWrap: async (pkcs8) => { kept.wrap = pkcs8.slice(); },
  });
  if (!(arrival instanceof Arrival)) {
    kept.session?.fill(0);
    kept.wrap?.fill(0);
    return arrival;
  }
  return { arrival, client, unlock: unlock, unlockSpki, sessionPkcs8: kept.session, wrapPkcs8: kept.wrap };
}

export async function keepArrived(a: Arriving, pin: string): Promise<{ client: Client; longKey: CryptoKey }> {
  const { client } = a;
  const held = client.held;
  if (!a.arrival.seated || !held) throw new Error("the move has not arrived yet");
  // The ack hands the long key under the paper code back (R3); it goes on its
  // own after the arrival, so it is waited for here, before the record.
  await a.arrival.ackDone;
  if (!a.sessionPkcs8 || !a.wrapPkcs8) throw new Error("the core did not hand the keys over");
  const set = await client.firstPin(pin);
  if (set.status !== 200 && set.status !== 204) throw new Error(`the first PIN was refused: ${set.status} ${JSON.stringify(set.body)}`);
  const deviceSalt = client.deviceSalt!;
  const material = await derivePin(pin, deviceSalt);
  const given = await client.request<{ share: string }>("POST", "/vault/share", { auth: base64url(material.auth) });
  material.auth.fill(0);
  if (given.status !== 200) throw new Error(`the node did not hand back its share: ${given.status}`);
  const share = fromBase64url(given.body.share);
  const key = await vaultKey(material.local, share);
  await armGrace(material.local, share);
  material.local.fill(0);
  share.fill(0);
  const longPkcs8 = await held.use(async (k) => new Uint8Array(await crypto.subtle.exportKey("pkcs8", k)));
  const wrapPrivate = await crypto.subtle.importKey("pkcs8", a.wrapPkcs8 as BufferSource, WRAP_ALGORITHM, true, ["deriveBits"]);
  const record: Record_ = {
    id: "me",
    identityId: client.identityId,
    sessionId: client.sessionId,
    longSpki: client.longSpki,
    deviceSalt,
    // From the ack (W9); empty only when the node did not say it, and then a
    // reissue on this device cannot open the key.
    wrappedLongKey: client.wrappedLongKey ?? new Uint8Array(0),
    sealedLong: await seal(key, longPkcs8),
    sealedSession: await seal(key, a.sessionPkcs8),
    sessionSpki: await sessionSpkiOf(a.sessionPkcs8),
    sealedWrap: await seal(key, a.wrapPkcs8),
    wrapSpki: await publicOf(wrapPrivate, WRAP_ALGORITHM),
    wrapCheck: await checkOf(wrapPrivate),
    unlockKey: a.unlock.privateKey,
    unlockSpki: a.unlockSpki,
    savedAt: Date.now(),
  };
  longPkcs8.fill(0);
  a.sessionPkcs8.fill(0);
  a.wrapPkcs8.fill(0);
  a.sessionPkcs8 = null;
  a.wrapPkcs8 = null;
  await putRecord(record);
  return { client, longKey: await held.signing() };
}

// The public half of an EC private key (extractable) as base64url SPKI.
async function publicOf(priv: CryptoKey, algorithm: EcKeyImportParams): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const usages: KeyUsage[] = algorithm.name === "ECDSA" ? ["verify"] : [];
  const pub = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, algorithm, true, usages);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
}

// The public half of an ECDSA P-256 private key from its pkcs8, base64url SPKI.
async function sessionSpkiOf(pkcs8: Uint8Array): Promise<string> {
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, P256, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const pub = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, P256, true, ["verify"]);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
}

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
