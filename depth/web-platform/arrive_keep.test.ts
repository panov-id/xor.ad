// keepArrived wipes what it held when it does not get to the end (review of day61-merge, 18.10.2026):
// a refused first PIN leaves the handed keys for another try (the node set nothing); past it — a share
// the node did not hand back, a record the disk did not take — the handed session and wrap pkcs8, the
// halves derived from the PIN and the node's share are zeroes, and the arrival keeps no copy of them.
// No node: the client is a stand-in that answers as the node would.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { newWrapPair } from "../core/client.ts";
import { base64url } from "../core/sign.ts";
import { type Arriving, createArrive } from "./arrive_keep.ts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const zero = (b: Uint8Array) => b.every((x) => x === 0);
const PIN = "582913";

async function arriving(answers: { firstPin: number; share: number }) {
  let wrapPkcs8 = new Uint8Array(0);
  await newWrapPair(async (p) => { wrapPkcs8 = p.slice(); });
  const session = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]) as CryptoKeyPair;
  const sessionPkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", session.privateKey));
  const long = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]) as CryptoKeyPair;
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const client = {
    held: { use: (f: (k: CryptoKey) => Promise<Uint8Array>) => f(long.privateKey), signing: async () => long.privateKey },
    deviceSalt: new Uint8Array(16).fill(7),
    identityId: "id-1", sessionId: "s-1", longSpki: "spki", wrappedLongKey: new Uint8Array(4),
    firstPin: async () => ({ status: answers.firstPin, body: {} }),
    request: async () => ({ status: answers.share, body: { share: base64url(new Uint8Array(32).fill(9)) } }),
  };
  const a = {
    arrival: { seated: true, ackDone: Promise.resolve() },
    client, unlock, unlockSpki: "u", sessionPkcs8, wrapPkcs8,
  } as unknown as Arriving;
  return { a, sessionPkcs8, wrapPkcs8 };
}

Deno.test("keepArrived: a refused first PIN keeps the handed keys for the next try", async () => {
  const { keepArrived } = createArrive({ node: { base: "", key: "" }, putRecord: async () => {}, armGrace: async () => {} });
  const { a, sessionPkcs8, wrapPkcs8 } = await arriving({ firstPin: 422, share: 200 });
  await assertRejects(() => keepArrived(a, PIN), Error, "the first PIN was refused");
  assert(a.sessionPkcs8 === sessionPkcs8 && a.wrapPkcs8 === wrapPkcs8, "the arrival still holds its keys");
  assert(!zero(sessionPkcs8) && !zero(wrapPkcs8), "the handed keys are intact");
});

Deno.test("keepArrived: a share the node did not hand back wipes the handed keys", async () => {
  const { keepArrived } = createArrive({ node: { base: "", key: "" }, putRecord: async () => {}, armGrace: async () => {} });
  const { a, sessionPkcs8, wrapPkcs8 } = await arriving({ firstPin: 204, share: 403 });
  await assertRejects(() => keepArrived(a, PIN), Error, "did not hand back its share");
  assert(zero(sessionPkcs8), "session pkcs8 is zeroes");
  assert(zero(wrapPkcs8), "wrap pkcs8 is zeroes");
  assertEquals([a.sessionPkcs8, a.wrapPkcs8], [null, null]);
});

Deno.test("keepArrived: a record the disk did not take wipes the keys, the PIN's half and the share", async () => {
  const seen: Uint8Array[] = [];
  const { keepArrived } = createArrive({
    node: { base: "", key: "" },
    putRecord: async () => { throw new Error("disk full"); },
    armGrace: async (local, share) => { seen.push(local, share); },
  });
  const { a, sessionPkcs8, wrapPkcs8 } = await arriving({ firstPin: 204, share: 200 });
  await assertRejects(() => keepArrived(a, PIN), Error, "disk full");
  assertEquals(seen.length, 2);
  assert(zero(seen[0]), "the PIN's local half is zeroes");
  assert(zero(seen[1]), "the node's share is zeroes");
  assert(zero(sessionPkcs8) && zero(wrapPkcs8), "the handed keys are zeroes");
  assertEquals([a.sessionPkcs8, a.wrapPkcs8], [null, null]);
});
