// A device the identity is arriving at by a move (T1; chat spec §8.2), for the faces with a disk (web,
// the app shell): the claim goes with an unlock key and hands the session key's and the wrapping pair's
// pkcs8 over once; after "it is me" on the old device the core seats the client with the long key held,
// and a first PIN seals the record exactly as after a raise by the paper code.
//
// Moved out of web/src/vault.ts on 18.10.2026 (claimArrival, keepArrived) so that the web and the app
// shell keep an arrived identity the same way — and either opens what the other kept. Behaviour unchanged.
import { type Answer, Client, WRAP_ALGORITHM } from "../core/client.ts";
import { checkOf, type Record_ } from "../core/enroll.ts";
import { seal, vaultKey } from "../core/lock.ts";
import { derivePin } from "../core/pin.ts";
import { fromBase64url } from "../core/seal.ts";
import { base64url } from "../core/sign.ts";
import { Arrival } from "../core/transfer_move.ts";
import type { NodeAt } from "../core/unlock.ts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

export interface Arriving {
  arrival: Arrival;
  client: Client;
  unlock: CryptoKeyPair;
  unlockSpki: string;
  sessionPkcs8: Uint8Array | null;
  wrapPkcs8: Uint8Array | null;
}

/** The public half of an EC private key (extractable) as base64url SPKI. */
export async function publicOf(priv: CryptoKey, algorithm: EcKeyImportParams): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const usages: KeyUsage[] = algorithm.name === "ECDSA" ? ["verify"] : [];
  const pub = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, algorithm, true, usages);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
}

/** The public half of an ECDSA P-256 private key from its pkcs8, base64url SPKI. */
export async function sessionSpkiOf(pkcs8: Uint8Array): Promise<string> {
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, P256, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const pub = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, P256, true, ["verify"]);
  return base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pub)));
}

export interface ArriveConfig {
  node: NodeAt;
  putRecord(record: Record_): Promise<unknown>;
  armGrace(local: Uint8Array, share: Uint8Array): Promise<void>;
}

export function createArrive(config: ArriveConfig) {
  async function claimArrival(code: string, label: string): Promise<Arriving | Answer> {
    const client = new Client(config.node.base, config.node.key);
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

  async function keepArrived(a: Arriving, pin: string): Promise<{ client: Client; longKey: CryptoKey }> {
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
    await config.armGrace(material.local, share);
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
    await config.putRecord(record);
    return { client, longKey: await held.signing() };
  }

  return { claimArrival, keepArrived };
}
