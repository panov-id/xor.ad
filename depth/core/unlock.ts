// Opening the record this device keeps (the unseal side of enroll.ts), for the faces with a disk (web
// vault.ts, the app's vault.ts). The PIN is derived (pin.ts), the unlock pair's one signed call asks the node
// for its share against the PIN's proof, the storage key is HKDF(local ‖ share) (lock.ts vaultKey), the long
// key, the session key (after a raise) and the wrapping pair come out of their seals non-extractable, and a
// client is seated with them. Where the record lives (IndexedDB) and the reload grace are the face's own;
// this is everything between the record and the seated client.
//
// Moved out of web/src/vault.ts on 17.10.2026 so that the web and the app shell open the same record the
// same way — the identity made by either opens in the other.
import { Client, type HeldLongKey, WRAP_ALGORITHM, WRAP_USAGES } from "./client.ts";
import { checkOf, type Record_ } from "./enroll.ts";
import { open as unseal, vaultKey } from "./lock.ts";
import { derivePin } from "./pin.ts";
import { fromBase64url } from "./seal.ts";
import { base64url, type SigningKey } from "./sign.ts";
import { HeldKey } from "./transfer.ts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

/** Where the node is and who calls it (the face's config). */
export interface NodeAt {
  base: string;
  key: string;
}

export interface Opened {
  client: Client;
  longKey: CryptoKey;
  /** The wrapping pair that came out of its seal derives what it derived before the reload. */
  wrapSame: boolean;
}

export type ShareAnswer =
  | { ok: true; share: Uint8Array; local: Uint8Array }
  | { ok: false; code: string; attemptsLeft?: number; retryAfter?: number };

const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The PIN's proof to the node, signed by the unlock key (a client seated with it as its session key can sign
 * exactly what the node lets that key sign: POST /vault/share and nothing else). The node's share and the
 * PIN's local half on 200; the node's code (or `status_<n>`), the attempts left and the wait otherwise. The
 * caller wipes `share` and `local` once used.
 */
export async function askShare(record: Record_, pin: string, node: NodeAt): Promise<ShareAnswer> {
  const material = await derivePin(pin, record.deviceSalt);
  // The long-key and wrapping slots are filled with the same key and a throwaway pair — nothing reads them
  // before the real seat in openWith.
  const asking = new Client(node.base, node.key);
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
    return { ok: false, code: given.body?.error?.code ?? `status_${given.status}`, attemptsLeft: given.body?.error?.attempts_left, retryAfter: given.retryAfter };
  }
  return { ok: true, share: fromBase64url(given.body.share), local: material.local };
}

/** After a reload: the PIN, the share, the seals opened. */
export async function unlockWithPin(
  record: Record_, pin: string, node: NodeAt, armed?: (local: Uint8Array, share: Uint8Array) => Promise<void>,
): Promise<{ ok: true; opened: Opened } | Exclude<ShareAnswer, { ok: true }>> {
  const given = await askShare(record, pin, node);
  if (!given.ok) return given;
  return { ok: true, opened: await openWith(record, given.local, given.share, node, armed) };
}

/**
 * The seals open under HKDF(local ‖ share), the keys into memory non-extractable, a seated client. Both
 * halves are wiped here — after `armed` (the face's reload grace) has taken its copies. One vault key for
 * every seal, and the halves wiped once all are open: a wipe between two left the wrapping pair sealed under
 * a key made of zeros (verifier of W1c, the first red run after W1d).
 */
export async function openWith(
  record: Record_, local: Uint8Array, share: Uint8Array, node: NodeAt, armed?: (local: Uint8Array, share: Uint8Array) => Promise<void>,
): Promise<Opened> {
  let long: CryptoKey;
  let held: HeldLongKey;
  let session: CryptoKey | null = null;
  let wrapPrivate: CryptoKey;
  try {
    const key = await vaultKey(local, share);
    // Held as the registration and the raise hold it, so a move can hand the long key over after a reload too.
    const longPkcs8 = await unseal(key, record.sealedLong);
    try {
      held = await HeldKey.hold(await crypto.subtle.importKey("pkcs8", longPkcs8 as BufferSource, P256, true, ["sign"]));
      long = await crypto.subtle.importKey("pkcs8", longPkcs8 as BufferSource, P256, false, ["sign"]);
    } finally {
      longPkcs8.fill(0);
    }
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
    if (armed) await armed(local, share);
  } finally {
    local.fill(0);
    share.fill(0);
  }
  const client = new Client(node.base, node.key);
  const longSigning: SigningKey = { privateKey: long, publicSpki: record.longSpki };
  // The key that signs: the session's own after a raise, the long key after a registration (there they are one key).
  const sessionSigning: SigningKey = session ? { privateKey: session, publicSpki: record.sessionSpki ?? record.longSpki } : longSigning;
  // The same wrapping pair as before the reload, out of its seal (W1d).
  wrapPrivate = (await crypto.subtle.generateKey(WRAP_ALGORITHM, false, WRAP_USAGES) as CryptoKeyPair).privateKey;
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
    // Empty after a move (keepArrived): nothing to hand the core.
    wrappedLongKey: record.wrappedLongKey.length ? record.wrappedLongKey : undefined,
    held,
  });
  return { client, longKey: long, wrapSame: same };
}
