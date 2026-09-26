// The paper code used (chat spec §8.2, "Бумажный код восстановления"): raising
// the identity with it, and trading it for a new one.
//
//   raise    POST /recovery/claim — on a clean device unsigned, with fresh keys
//            for the new session; on this device signed by its own session,
//            frozen or not, which lifts the tenth PIN mistake (pin_limit). The
//            node answers with the long key under the code, and the device
//            opens it here.
//   firstPin POST /vault/init — the claim left a grant; the new PIN takes it
//            (Client.firstPin).
//   reissue  POST /recovery/reissue — the current code proved, the next one's
//            lookup and the long key wrapped under it, in one transaction on
//            the node: the new code works and the old stops together.
//
// The long key is extractable only inside rewrap() and publicHalf(), each one
// call long, the way paper.ts wrapLongKey handles it at registration; what the
// client signs with is the non-extractable copy. The ciphertext the node hands
// back is kept in the client (Client.wrappedLongKey): a reissue opens it under
// the current code and seals it under the next (quorum 3/3 in the artel,
// 2026-09-26 — not a same-device claim to fetch it, whose side effects re-arm
// the first-PIN grant; not a long key kept extractable for the process).

import type { Answer, Client, HeldLongKey } from "./client.ts";
import { derivePaperCode, unwrapLongKey, wrapLongKey } from "./paper.ts";
import { base64url, generateSigningKey } from "./sign.ts";

const SALT = new TextEncoder().encode("xor.ad/recovery/v1");
const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// How a use of the code ended, in the words a screen needs. `no_match` is one
// answer for "no such code", "not yours" and "that code does not open this
// key" — the node gives one wording for all of them, and so does the device.
export type Outcome =
  | { ok: true }
  | { ok: false; reason: "no_match" | "rate_limited" | "stepped_away" | "refused"; retryAfter?: number; status?: number };

export function refusal(answer: Answer): Outcome {
  const code = (answer.body as { error?: { code?: string } } | null)?.error?.code;
  if (answer.status === 404) return { ok: false, reason: "no_match", status: 404 };
  if (answer.status === 429) return { ok: false, reason: "rate_limited", retryAfter: answer.retryAfter, status: 429 };
  if (code === "stepped_away") return { ok: false, reason: "stepped_away", status: answer.status };
  return { ok: false, reason: "refused", status: answer.status };
}

// The key opened extractable for the length of `use`, and nowhere else. A code
// that does not open it is `null`, told apart from a failure inside `use` —
// a keeper that threw is not a wrong code (verifier, 2026-09-26).
async function withExtractable<T>(wrapped: Uint8Array, wrapKey: CryptoKey, use: (k: CryptoKey) => Promise<T>): Promise<T | null> {
  let extractable: CryptoKey;
  try {
    extractable = await crypto.subtle.unwrapKey(
      "pkcs8",
      wrapped.slice(12),
      wrapKey,
      { name: "AES-GCM", iv: wrapped.slice(0, 12), additionalData: SALT } as AesGcmParams,
      P256,
      true,
      ["sign"],
    );
  } catch {
    return null;
  }
  return await use(extractable);
}

// The node never says what one's own long key is (only the peer's, in the
// inbox), and the safety code is made of it: the public half is taken from the
// private one inside the one call that holds it. From its pkcs8, which carries
// the public point (RFC 5915, the ECPrivateKey's [1]), into bytes that are
// zeroed before the call returns — not from its JWK, whose `d` was a string
// no one can wipe and that lived until the collector came (review panel
// 2026-09-26, F22). Both runtimes put the point there (measured 26.09.2026,
// Deno 2.1.4 and Node 24: 138 bytes, the point at 73).
const POINT_TAG = [0xa1, 0x44, 0x03, 0x42, 0x00, 0x04];
export async function publicHalf(extractable: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", extractable));
  try {
    const at = der.findIndex((_, i) => POINT_TAG.every((b, j) => der[i + j] === b));
    if (at < 0) throw new Error("the long key's pkcs8 carries no public point");
    const pub = await crypto.subtle.importKey("raw", der.slice(at + 5, at + 5 + 65), P256, true, ["verify"]);
    return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
  } finally {
    der.fill(0);
  }
}

// POST /recovery/claim. A client with a session asks as this device: the
// session is raised, its PIN counter goes back to ten, and a first-PIN grant
// waits. A client without one is a clean device: a new session with new keys,
// and the old device frozen. Either way the code stays alive until reissue.
//
// `hold` hands the opened long key to a keeper that a move can later open
// again (transfer.ts HeldKey) — extractable only inside that call.
export async function raise(
  client: Client,
  code: string,
  opts: { label?: string; hold?: (extractable: CryptoKey) => Promise<HeldLongKey> } = {},
): Promise<Outcome & { sameDevice?: boolean }> {
  const { lookupId, wrapKey } = await derivePaperCode(code);
  const sameDevice = client.registered;
  const fresh = sameDevice ? null : {
    session: await generateSigningKey(),
    wrap: await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair,
  };
  const body = fresh
    ? {
      lookup_id: lookupId,
      sign_pub: fresh.session.publicSpki,
      wrap_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", fresh.wrap.publicKey))),
      ...(opts.label ? { label: opts.label } : {}),
    }
    : { lookup_id: lookupId };
  const answer = await client.request<{ identity_id: string; session_id: string; recovery_wrapped_key: string }>(
    "POST", "/recovery/claim", body, sameDevice,
  );
  if (answer.status !== 200) return refusal(answer);

  const wrapped = fromBase64url(answer.body.recovery_wrapped_key);
  // A key the code does not open is the node's word against the code's, and
  // the code wins: nothing is seated.
  const opened = await withExtractable(wrapped, wrapKey, async (k) => ({
    longSpki: await publicHalf(k),
    held: opts.hold ? await opts.hold(k) : undefined,
  }));
  if (!opened) return { ok: false, reason: "no_match" };
  if (sameDevice) {
    client.holdWrappedLongKey(wrapped);
    return { ok: true, sameDevice: true };
  }
  client.seat({
    identityId: answer.body.identity_id,
    sessionId: answer.body.session_id,
    sessionKey: fresh!.session,
    longKey: await unwrapLongKey(wrapped, wrapKey),
    longSpki: opened.longSpki,
    wrapPrivate: fresh!.wrap.privateKey,
    wrappedLongKey: wrapped,
    held: opened.held,
  });
  return { ok: true, sameDevice: false };
}

// The long key from under the current code to under the next, checked on the
// way: wrapLongKey unwraps what it made, so a wrap that cannot be opened fails
// here and not on somebody's clean device a year later.
async function rewrap(wrapped: Uint8Array, current: CryptoKey, next: CryptoKey): Promise<Uint8Array | null> {
  return await withExtractable(wrapped, current, async (k) => (await wrapLongKey(k, next)).wrapped);
}

// Whether `code` is the one the long key this device holds is wrapped under —
// asked before a new code is shown, so nobody writes down a code that a wrong
// current one will never let become real (verifier, 2026-09-26). On the
// device only: the node counts nothing for it — unless a reissue is still
// unsettled, which is settled first, because the key in hand may then be under
// a code the node has already retired.
export async function isCurrentCode(client: Client, code: string): Promise<boolean> {
  const pending = unsettled.get(client);
  if (pending) await settle(client, pending);
  const held = client.wrappedLongKey;
  if (!held) return false;
  const { wrapKey } = await derivePaperCode(code);
  return (await withExtractable(held, wrapKey, () => Promise.resolve(true))) === true;
}

// A reissue whose outcome this device does not know: both answers were lost,
// so the node may or may not have changed the code. Kept per client with the
// exact body and nonce it was sent with, so that asking again is a replay the
// node recognises, not a new action (depth.reissue.lostreply, 2026-09-26).
interface Unsettled {
  body: { nonce: string; current: { lookup_id: string }; next: { lookup_id: string; wrapped_key: string } };
  wrapped: Uint8Array;
}
const unsettled = new WeakMap<Client, Unsettled>();

// Which code the node holds after a reissue whose answer never came, and the
// long key kept under exactly that one. The same nonce with the same body:
//   204 — the node has the next code, whether it took it the first time or
//         only now (a request that never arrived is carried out by this one);
//   404 — the nonce outlived nonce.ttl (ten minutes) and the current code no
//         longer matches. Only this device's session can change the code: a
//         paper-code claim elsewhere would have frozen it, and a frozen
//         session is refused with 401, not 404. So the next code is live. It
//         costs one miss in the shared counter, once.
// Anything else leaves it unknown and kept; a lost answer again throws.
async function settle(client: Client, pending: Unsettled): Promise<Outcome | null> {
  const answer = await client.request("POST", "/recovery/reissue", pending.body);
  if (answer.status !== 204 && answer.status !== 404) return refusal(answer);
  client.holdWrappedLongKey(pending.wrapped);
  unsettled.delete(client);
  return null;
}

// POST /recovery/reissue — `current` is the code on the paper now, `next` the
// one just shown and typed back. A current code that does not open the key
// this device holds is refused here, before the node counts a miss for it.
//
// Two answers lost in a row used to leave the device holding the key under a
// code the node had already retired, until the process ended: the retry with
// a new nonce met the new code and was refused as a miss (verifier of B1). Now
// that reissue is kept unsettled and the next call settles it first; asked
// again with the same two codes, it is simply done.
export async function reissue(client: Client, current: string, next: string): Promise<Outcome> {
  const [now, then] = await Promise.all([derivePaperCode(current), derivePaperCode(next)]);
  const pending = unsettled.get(client);
  if (pending) {
    const refused = await settle(client, pending);
    if (refused) return refused;
    if (pending.body.current.lookup_id === now.lookupId && pending.body.next.lookup_id === then.lookupId) return { ok: true };
  }
  const held = client.wrappedLongKey;
  if (!held) throw new Error("this device holds no long key under a paper code: raise or register first");
  const wrapped = await rewrap(held, now.wrapKey, then.wrapKey);
  if (!wrapped) return { ok: false, reason: "no_match" };
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = { nonce, current: { lookup_id: now.lookupId }, next: { lookup_id: then.lookupId, wrapped_key: base64url(wrapped) } };
  let answer: Answer;
  try {
    answer = await client.request("POST", "/recovery/reissue", body);
  } catch {
    // The answer was lost, not the request: the same nonce again is answered
    // 204 by a node that took it (protocol §2), and nothing twice.
    try {
      answer = await client.request("POST", "/recovery/reissue", body);
    } catch (error) {
      unsettled.set(client, { body, wrapped });
      throw error;
    }
  }
  if (answer.status !== 204) return refusal(answer);
  client.holdWrappedLongKey(wrapped);
  return { ok: true };
}
