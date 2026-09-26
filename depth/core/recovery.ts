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

function refusal(answer: Answer): Outcome {
  const code = (answer.body as { error?: { code?: string } } | null)?.error?.code;
  if (answer.status === 404) return { ok: false, reason: "no_match", status: 404 };
  if (answer.status === 429) return { ok: false, reason: "rate_limited", retryAfter: answer.retryAfter, status: 429 };
  if (code === "stepped_away") return { ok: false, reason: "stepped_away", status: answer.status };
  return { ok: false, reason: "refused", status: answer.status };
}

// The key opened extractable for the length of `use`, and nowhere else.
async function withExtractable<T>(wrapped: Uint8Array, wrapKey: CryptoKey, use: (k: CryptoKey) => Promise<T>): Promise<T> {
  const extractable = await crypto.subtle.unwrapKey(
    "pkcs8",
    wrapped.slice(12),
    wrapKey,
    { name: "AES-GCM", iv: wrapped.slice(0, 12), additionalData: SALT } as AesGcmParams,
    P256,
    true,
    ["sign"],
  );
  return await use(extractable);
}

// The node never says what one's own long key is (only the peer's, in the
// inbox), and the safety code is made of it: the public half is taken from the
// private one's JWK — x and y — inside the one call that holds it.
async function publicHalf(extractable: CryptoKey): Promise<string> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", extractable);
  const pub = await crypto.subtle.importKey("jwk", { kty, crv, x, y }, P256, true, ["verify"]);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
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
  let opened: { longSpki: string; held?: HeldLongKey };
  try {
    opened = await withExtractable(wrapped, wrapKey, async (k) => ({
      longSpki: await publicHalf(k),
      held: opts.hold ? await opts.hold(k) : undefined,
    }));
  } catch {
    return { ok: false, reason: "no_match" };
  }
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
async function rewrap(wrapped: Uint8Array, current: CryptoKey, next: CryptoKey): Promise<Uint8Array> {
  return await withExtractable(wrapped, current, async (k) => (await wrapLongKey(k, next)).wrapped);
}

// POST /recovery/reissue — `current` is the code on the paper now, `next` the
// one just shown and typed back. A current code that does not open the key
// this device holds is refused here, before the node counts a miss for it.
export async function reissue(client: Client, current: string, next: string): Promise<Outcome> {
  const held = client.wrappedLongKey;
  if (!held) throw new Error("this device holds no long key under a paper code: raise or register first");
  const [now, then] = await Promise.all([derivePaperCode(current), derivePaperCode(next)]);
  let wrapped: Uint8Array;
  try {
    wrapped = await rewrap(held, now.wrapKey, then.wrapKey);
  } catch {
    return { ok: false, reason: "no_match" };
  }
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = { nonce, current: { lookup_id: now.lookupId }, next: { lookup_id: then.lookupId, wrapped_key: base64url(wrapped) } };
  let answer: Answer;
  try {
    answer = await client.request("POST", "/recovery/reissue", body);
  } catch {
    // The answer was lost, not the request: the same nonce again is answered
    // 204 by a node that took it (protocol §2), and nothing twice.
    answer = await client.request("POST", "/recovery/reissue", body);
  }
  if (answer.status !== 204) return refusal(answer);
  client.holdWrappedLongKey(wrapped);
  return { ok: true };
}
