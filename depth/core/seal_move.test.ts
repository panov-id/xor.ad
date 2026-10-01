// The wrap key of a device after a move or a raise (W11-K1, open.tsv
// chat.wraps.client): transfer_move.ts Arrival.claim and recovery.ts raise
// make it with newWrapPair, whose private half carries deriveKey — so
// seal.ts wrapKeyFor takes its key-to-key branch, where the shared secret never
// becomes bytes. seal.test.ts covers only the other branch (a pair born with
// deriveBits alone). Here: a wrap made for such a device opens; the copy a
// face with a disk keeps after the hand-over (holdWrap) opens it the same;
// and the two branches of wrapKeyFor derive one key — the same pkcs8 imported
// with deriveBits alone opens the same wrap.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Ephemeral, unwrapConversation } from "./seal.ts";
import { base64url, generateSigningKey } from "./sign.ts";
import { newWrapPair, WRAP_ALGORITHM } from "./client.ts";

const CHAT = "3d5c1c0a-9d1e-4a1a-8b7f-2f0d4c9a1e11";
const MATCH = "7a1b2c3d-0000-4000-8000-0000000000aa";
const LOW = "00000000-0000-4000-8000-000000000001";
const HIGH = "00000000-0000-4000-8000-000000000002";

const spkiOf = async (key: CryptoKey) => base64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

// Two sides; A's keys wrapped for the device's wrap public half, as the node
// would store them at `epoch`.
async function wrappedFor(wrapPublic: CryptoKey, epoch = 0) {
  const aLong = await generateSigningKey();
  const bLong = await generateSigningKey();
  const aEph = await Ephemeral.generate();
  const bEph = await Ephemeral.generate();
  const aHalf = await aEph.publish(aLong.privateKey, MATCH);
  const bHalf = await bEph.publish(bLong.privateKey, MATCH);
  const { conversation: a, wrapped } = await aEph.openAndWrap(bHalf, bLong.publicSpki, MATCH, CHAT, LOW, HIGH, {
    wrapPublicSpki: await spkiOf(wrapPublic), epoch,
  });
  const b = await bEph.open(aHalf, aLong.publicSpki, MATCH, CHAT, HIGH, LOW);
  return { a, b, wrapped };
}

Deno.test("a device after a move or a raise (wrap key with deriveKey) opens the wrap made for it", async () => {
  const device = await newWrapPair();
  assert(device.privateKey.usages.includes("deriveKey"), "the device's wrap key does not carry deriveKey — not the branch under test");
  const { b, wrapped } = await wrappedFor(device.publicKey, 2);
  const restored = await unwrapConversation(wrapped, device.privateKey, CHAT, 2, LOW, HIGH);
  const id = crypto.randomUUID();
  assertEquals(await restored.open(await b.seal("после переезда", id), id), "после переезда");
  assertEquals(await b.open(await restored.seal("и обратно", id), id), "и обратно");
  // Another chat or epoch does not open under this branch either.
  await assertRejects(() => unwrapConversation(wrapped, device.privateKey, "another-chat", 2, LOW, HIGH), Error, "does not open");
  await assertRejects(() => unwrapConversation(wrapped, device.privateKey, CHAT, 3, LOW, HIGH), Error, "does not open");
});

Deno.test("the non-extractable copy a face with a disk keeps after the hand-over opens the wrap too", async () => {
  let pkcs8: Uint8Array | null = null;
  const device = await newWrapPair(async (bytes) => { pkcs8 = bytes.slice(); });
  assert(pkcs8, "the pkcs8 was not handed over");
  assertEquals(device.privateKey.extractable, false);
  const { b, wrapped } = await wrappedFor(device.publicKey);
  const restored = await unwrapConversation(wrapped, device.privateKey, CHAT, 0, LOW, HIGH);
  const id = crypto.randomUUID();
  assertEquals(await restored.open(await b.seal("с диска", id), id), "с диска");
});

Deno.test("both branches of wrapKeyFor derive one key: the same pkcs8 with deriveBits alone opens the same wrap", async () => {
  let pkcs8: Uint8Array | null = null;
  const device = await newWrapPair(async (bytes) => { pkcs8 = bytes.slice(); });
  // The same private half, able to deriveBits only: wrapKeyFor's bytes branch.
  const bitsOnly = await crypto.subtle.importKey("pkcs8", pkcs8! as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"]);
  assert(!bitsOnly.usages.includes("deriveKey"));
  const { b, wrapped } = await wrappedFor(device.publicKey, 5);
  const byKey = await unwrapConversation(wrapped, device.privateKey, CHAT, 5, LOW, HIGH);
  const byBits = await unwrapConversation(wrapped, bitsOnly, CHAT, 5, LOW, HIGH);
  const id = crypto.randomUUID();
  const fromB = await b.seal("одна и та же", id);
  assertEquals(await byKey.open(fromB, id), "одна и та же");
  assertEquals(await byBits.open(fromB, id), "одна и та же");
  // A stranger born the same way opens nothing.
  const stranger = await newWrapPair();
  await assertRejects(() => unwrapConversation(wrapped, stranger.privateKey, CHAT, 5, LOW, HIGH), Error, "does not open");
});
