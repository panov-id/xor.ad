// The keys of a conversation, without a node: two sides, one chat id, and the
// three things §8.13 promises — the peer reads what I seal, a reflected
// message does not open, and a half nobody signed is refused.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Ephemeral, direction, unwrapConversation } from "./seal.ts";
import { base64url, generateSigningKey } from "./sign.ts";

const CHAT = "3d5c1c0a-9d1e-4a1a-8b7f-2f0d4c9a1e11";
const MATCH = "7a1b2c3d-0000-4000-8000-0000000000aa";
const LOW = "00000000-0000-4000-8000-000000000001";
const HIGH = "00000000-0000-4000-8000-000000000002";

async function pair() {
  const aLong = await generateSigningKey();
  const bLong = await generateSigningKey();
  const aEph = await Ephemeral.generate();
  const bEph = await Ephemeral.generate();
  const aHalf = await aEph.publish(aLong.privateKey, MATCH);
  const bHalf = await bEph.publish(bLong.privateKey, MATCH);
  const a = await aEph.open(bHalf, bLong.publicSpki, MATCH, CHAT, LOW, HIGH);
  const b = await bEph.open(aHalf, aLong.publicSpki, MATCH, CHAT, HIGH, LOW);
  return { a, b, aEph, bLong, bHalf, aHalf, aLong };
}

Deno.test("the direction is named by the sorted ids", () => {
  assertEquals(direction(LOW, HIGH), "low→high");
  assertEquals(direction(HIGH, LOW), "high→low");
});

Deno.test("what one side seals the other opens, and the node sees none of it", async () => {
  const { a, b } = await pair();
  const id = crypto.randomUUID();
  const box = await a.seal("гуляю у реки, если кто рядом", id);
  assert(!box.includes("реки"), "the ciphertext carries the text");
  assertEquals(await b.open(box, id), "гуляю у реки, если кто рядом");
  const back = await b.seal("иду", id);
  assertEquals(await a.open(back, id), "иду");
  // Two seals of one text differ: the nonce is fresh each time.
  assert(await a.seal("x", id) !== await a.seal("x", id));
});

Deno.test("a reflected message does not open: the sender's own key is not the peer's", async () => {
  const { a } = await pair();
  const id = crypto.randomUUID();
  const box = await a.seal("моё же", id);
  await assertRejects(() => a.open(box, id));
});

Deno.test("a half that is not signed by the peer's long key is refused", async () => {
  const { aEph, bLong, bHalf } = await pair();
  const stranger = await generateSigningKey();
  const forged = await (await Ephemeral.generate()).publish(stranger.privateKey, MATCH);
  await assertRejects(() => aEph.open(forged, bLong.publicSpki, MATCH, CHAT, LOW, HIGH), Error, "not signed");
  // The right half, signed for another match, is not a half for this one.
  await assertRejects(() => aEph.open(bHalf, bLong.publicSpki, "another-match", CHAT, LOW, HIGH), Error, "not signed");
  // The right half with the wrong chat id gives different keys: nothing opens.
  const other = await aEph.open(bHalf, bLong.publicSpki, MATCH, "another-chat", LOW, HIGH);
  const { b } = await pair();
  const sealed = await b.seal("x", "id-1");
  await assertRejects(() => other.open(sealed, "id-1"));
});

Deno.test("a box is bound to its local_id, and a replayed box does not open twice", async () => {
  const { a, b } = await pair();
  const id = crypto.randomUUID();
  const box = await a.seal("один раз", id);
  assertEquals(await b.open(box, id), "один раз");
  // The node replays the frame: the nonce was seen, the box does not open again.
  await assertRejects(() => b.open(box, id), Error, "seen");
  // The node re-labels a box: the AAD does not match.
  const other = await a.seal("другой", crypto.randomUUID());
  await assertRejects(() => b.open(other, id));
});

// The keys wrapped for a session (§8.13, db/061): what the web face keeps on
// disk and opens after a reload. The node stores what it cannot read; only the
// device whose wrap key it was made under opens it, for this chat and epoch.
const wrapPair = () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as Promise<CryptoKeyPair>;
const spkiOf = async (key: CryptoKey) => base64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

async function wrappedPair(epoch = 0) {
  const aLong = await generateSigningKey();
  const bLong = await generateSigningKey();
  const aEph = await Ephemeral.generate();
  const bEph = await Ephemeral.generate();
  const aHalf = await aEph.publish(aLong.privateKey, MATCH);
  const bHalf = await bEph.publish(bLong.privateKey, MATCH);
  const aWrap = await wrapPair();
  const { conversation: a, wrapped } = await aEph.openAndWrap(bHalf, bLong.publicSpki, MATCH, CHAT, LOW, HIGH, {
    wrapPublicSpki: await spkiOf(aWrap.publicKey), epoch,
  });
  const b = await bEph.open(aHalf, aLong.publicSpki, MATCH, CHAT, HIGH, LOW);
  return { a, b, wrapped, aWrap, bHalf, bLong, aEph };
}

Deno.test("a wrapped conversation opens again from the wrap alone, with the same keys", async () => {
  const { a, b, wrapped, aWrap } = await wrappedPair();
  const restored = await unwrapConversation(wrapped, aWrap.privateKey, CHAT, 0, LOW, HIGH);
  const id = crypto.randomUUID();
  assertEquals(await restored.open(await b.seal("после перезагрузки", id), id), "после перезагрузки");
  const back = await restored.seal("и обратно", id);
  assertEquals(await b.open(back, id), "и обратно");
  // The live conversation and the restored one are the same keys: what one
  // seals, the peer opens either way.
  assertEquals(await b.open(await a.seal("до перезагрузки", id), id), "до перезагрузки");
  // Two wraps of one conversation differ: a fresh pair and nonce each time.
  const { wrapped: again } = await wrappedPair();
  assert(again !== wrapped);
  // And the wrap is the size the node bounds it at (db/061: at most 768 bytes).
  assert(wrapped.length <= 1024, `a wrap of ${wrapped.length} characters`);
});

Deno.test("a wrap does not open under another session's key, for another chat, or at another epoch", async () => {
  const { wrapped, aWrap } = await wrappedPair(3);
  const stranger = await wrapPair();
  await assertRejects(() => unwrapConversation(wrapped, stranger.privateKey, CHAT, 3, LOW, HIGH), Error, "does not open");
  await assertRejects(() => unwrapConversation(wrapped, aWrap.privateKey, "another-chat", 3, LOW, HIGH), Error, "does not open");
  await assertRejects(() => unwrapConversation(wrapped, aWrap.privateKey, CHAT, 4, LOW, HIGH), Error, "does not open");
  // The node hands back something that is not a wrap at all.
  await assertRejects(() => unwrapConversation("AAAA", aWrap.privateKey, CHAT, 3, LOW, HIGH), Error, "not a key wrap");
  // The right key, chat and epoch still open it.
  await unwrapConversation(wrapped, aWrap.privateKey, CHAT, 3, LOW, HIGH);
});

Deno.test("openAndWrap still refuses a half nobody signed", async () => {
  const { aEph, bLong } = await wrappedPair();
  const stranger = await generateSigningKey();
  const forged = await (await Ephemeral.generate()).publish(stranger.privateKey, MATCH);
  const w = await wrapPair();
  await assertRejects(
    () => aEph.openAndWrap(forged, bLong.publicSpki, MATCH, CHAT, LOW, HIGH, { wrapPublicSpki: "", epoch: 0 }).then(() => spkiOf(w.publicKey)),
    Error, "not signed",
  );
});
