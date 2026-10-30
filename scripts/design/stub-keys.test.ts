// The shell stub's talk keys (measure-app-overlap.mjs, R-TAB6-6/7) against the app's own crypto (depth/core/seal.ts): its wrap opens
// as this session's conversation and not for another chat, the peers' long key gives a safety code, a peer's line opens with the
// conversation's open key. Run: node --experimental-transform-types --test scripts/design/stub-keys.test.ts (panel-tests-runner: playwright).
import { test } from "node:test";
import assert from "node:assert/strict";
import { safetyCode, unwrapConversation } from "../../depth/core/seal.ts";
import { PEER_SPKI, sealFrom, wrapFor } from "./measure-app-overlap.mjs";

const pair = async () => {
  const p = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  return { priv: p.privateKey, pub: Buffer.from(await crypto.subtle.exportKey("spki", p.publicKey)).toString("base64url") };
};

test("the stub's wrap opens as this session's conversation", async () => {
  const s = await pair();
  assert.ok(await unwrapConversation(await wrapFor(s.pub, "c1", 1), s.priv, "c1", 1, "id-stub", "id-nino"));
});
test("a wrap for another chat does not open", async () => {
  const s = await pair();
  await assert.rejects(unwrapConversation(await wrapFor(s.pub, "c2", 1), s.priv, "c1", 1, "id-stub", "id-nino"), /does not open/);
});
test("the peer's long key gives a safety code", async () => {
  const me = Buffer.from(await crypto.subtle.exportKey("spki", (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair).publicKey)).toString("base64url");
  assert.equal((await safetyCode(me, PEER_SPKI)).replace(/\D/g, "").length, 20);   // five groups of four (seal.ts)
});
test("a peer's line sealed by the stub opens in the app's conversation", async () => {
  const s = await pair();
  const c = await unwrapConversation(await wrapFor(s.pub, "c1", 1), s.priv, "c1", 1, "id-stub", "id-nino");
  assert.equal(await c.open(await sealFrom("c1", "id-nino", "id-stub", "Backgammon tonight?", "c1-l0"), "c1-l0"), "Backgammon tonight?");
});
