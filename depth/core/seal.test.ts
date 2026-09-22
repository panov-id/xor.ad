// The keys of a conversation, without a node: two sides, one chat id, and the
// three things §8.13 promises — the peer reads what I seal, a reflected
// message does not open, and a half nobody signed is refused.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Ephemeral, direction } from "./seal.ts";
import { generateSigningKey } from "./sign.ts";

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
  const box = await a.seal("гуляю у реки, если кто рядом");
  assert(!box.includes("реки"), "the ciphertext carries the text");
  assertEquals(await b.open(box), "гуляю у реки, если кто рядом");
  const back = await b.seal("иду");
  assertEquals(await a.open(back), "иду");
  // Two seals of one text differ: the nonce is fresh each time.
  assert(await a.seal("x") !== await a.seal("x"));
});

Deno.test("a reflected message does not open: the sender's own key is not the peer's", async () => {
  const { a } = await pair();
  const box = await a.seal("моё же");
  await assertRejects(() => a.open(box));
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
  const sealed = await b.seal("x");
  await assertRejects(() => other.open(sealed));
});
