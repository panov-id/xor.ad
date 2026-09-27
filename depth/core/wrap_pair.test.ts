// The wrapping pair a face with a disk keeps (W1d, 2026-09-26): born
// extractable for the one hand-over of its pkcs8, and the copy the client
// works with is non-extractable and the same key — what it derives with a
// peer is what the original derives. Without the hand-over the pair is born
// non-extractable and its bytes never exist.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { newWrapPair, WRAP_ALGORITHM } from "./client.ts";

const bits = async (mine: CryptoKey, theirs: CryptoKey) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine, 256));

Deno.test("the handed-over pkcs8 and the kept copy are one key, and the copy cannot be exported", async () => {
  let taken: Uint8Array | null = null;
  const pair = await newWrapPair(async (pkcs8) => { taken = pkcs8.slice(); });
  assert(taken, "the pkcs8 was not handed over");
  assertEquals(pair.privateKey.extractable, false);
  const fromBytes = await crypto.subtle.importKey("pkcs8", taken! as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"]);
  const peer = await crypto.subtle.generateKey(WRAP_ALGORITHM, false, ["deriveBits"]) as CryptoKeyPair;
  assertEquals(await bits(pair.privateKey, peer.publicKey), await bits(fromBytes, peer.publicKey));
  await assertRejects(() => crypto.subtle.exportKey("pkcs8", pair.privateKey));
});

Deno.test("the pkcs8 given to the hand-over is wiped once it returns", async () => {
  let seen: Uint8Array | null = null;
  await newWrapPair(async (pkcs8) => { seen = pkcs8; });
  assert(seen!.every((b) => b === 0), "the bytes outlived the hand-over");
});

Deno.test("without a hand-over the pair is born non-extractable", async () => {
  const pair = await newWrapPair();
  assertEquals(pair.privateKey.extractable, false);
  await assertRejects(() => crypto.subtle.exportKey("pkcs8", pair.privateKey));
});
