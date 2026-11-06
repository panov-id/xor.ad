// What an attacker holding the node can do to the bytes that pass through it: spoil them anywhere, send garbage,
// mix chats and epochs. Each byte position is tried, not a sample, so a part of the box left out of the tag fails here.
// The last test pins a known limit (docs/reviews/crypto-attack-2026-11-02_EN.md), it is not a promise.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Ephemeral, fromBase64url, unwrapConversation, verifyHalf } from "./seal.ts";
import { base64url, generateSigningKey } from "./sign.ts";

const CHAT = "3d5c1c0a-9d1e-4a1a-8b7f-2f0d4c9a1e11";
const MATCH = "7a1b2c3d-0000-4000-8000-0000000000aa";
const LOW = "00000000-0000-4000-8000-000000000001";
const HIGH = "00000000-0000-4000-8000-000000000002";

const flipped = (value: string, at: number): string => {
  const bytes = fromBase64url(value);
  bytes[at] ^= 0x01;
  return base64url(bytes);
};

async function setup() {
  const aLong = await generateSigningKey(), bLong = await generateSigningKey();
  const aEph = await Ephemeral.generate(), bEph = await Ephemeral.generate();
  const aHalf = await aEph.publish(aLong.privateKey, MATCH), bHalf = await bEph.publish(bLong.privateKey, MATCH);
  const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
  const wrapPublicSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey)));
  const { conversation: a, wrapped } = await aEph.openAndWrap(bHalf, bLong.publicSpki, MATCH, CHAT, LOW, HIGH, { wrapPublicSpki, epoch: 0 });
  const b = await bEph.open(aHalf, aLong.publicSpki, MATCH, CHAT, HIGH, LOW);
  return { a, b, wrapped, wrap, bHalf, bLong };
}

Deno.test("one flipped bit at any byte of a sealed message: it does not open", async () => {
  const { a, b } = await setup();
  const id = crypto.randomUUID();
  const box = await a.seal("встреча в восемь", id);
  const n = fromBase64url(box).length;
  assert(n > 28);
  for (let at = 0; at < n; at++) await assertRejects(() => b.open(flipped(box, at), id), Error, undefined, `byte ${at} of ${n}`);
  assertEquals(await b.open(box, id), "встреча в восемь"); // the refusals did not spoil the good one
});

// Byte 25 of the SPKI is the DER BIT STRING's «unused bits» (always 0 for a key): the engine ignores it, the point and so
// the key are unchanged. Malleable form, same keys: such a wrap opens the same conversation and gives the node nothing.
const SPKI_UNUSED_BITS = 25;
Deno.test("one flipped bit at any byte of a key wrap: it does not open, but for the SPKI's unused-bits byte, which changes no key", async () => {
  const { a, wrapped, wrap } = await setup();
  const n = fromBase64url(wrapped).length, opened: number[] = [];
  for (let at = 0; at < n; at++) {
    if (await unwrapConversation(flipped(wrapped, at), wrap.privateKey, CHAT, 0, LOW, HIGH).then(() => true, () => false)) opened.push(at);
  }
  assertEquals(opened, [SPKI_UNUSED_BITS]);
  const id = crypto.randomUUID(), box = await a.seal("тот же ключ", id);
  const peerSide = await unwrapConversation(flipped(wrapped, SPKI_UNUSED_BITS), wrap.privateKey, CHAT, 0, HIGH, LOW);
  assertEquals(await peerSide.open(box, id), "тот же ключ");
});

Deno.test("one flipped bit at any byte of a half's key or signature: it is refused", async () => {
  const { bHalf, bLong } = await setup();
  assert(await verifyHalf(bHalf, bLong.publicSpki, { match: MATCH }));
  for (const field of Object.keys(bHalf) as Array<keyof typeof bHalf>) {
    const n = fromBase64url(bHalf[field] as string).length;
    for (let at = 0; at < n; at++) {
      const spoiled = { ...bHalf, [field]: flipped(bHalf[field] as string, at) };
      const ok = await verifyHalf(spoiled, bLong.publicSpki, { match: MATCH }).catch(() => false);
      assertEquals(ok, false, `${String(field)} byte ${at} of ${n}`);
    }
  }
});

Deno.test("a half signed for one match is refused for another, and for a chat's rekey", async () => {
  const { bHalf, bLong } = await setup();
  assertEquals(await verifyHalf(bHalf, bLong.publicSpki, { match: crypto.randomUUID() }), false);
  assertEquals(await verifyHalf(bHalf, bLong.publicSpki, { chat: CHAT, epoch: 1 }), false);
});

Deno.test("garbage of every short length and random bytes: refused with an error, never opened", async () => {
  const { b, wrap } = await setup();
  const id = crypto.randomUUID();
  for (let len = 0; len <= 64; len++) {
    const junk = base64url(crypto.getRandomValues(new Uint8Array(len)));
    await assertRejects(() => b.open(junk, id));
    await assertRejects(() => unwrapConversation(junk, wrap.privateKey, CHAT, 0, LOW, HIGH));
  }
  for (const bad of ["", "====", "not base64 at all!", "%00", "\u0000"]) await assertRejects(() => b.open(bad, id));
});

Deno.test("20 000 seals of one text: no nonce twice, no ciphertext twice", async () => {
  const { a } = await setup();
  const id = crypto.randomUUID(), nonces = new Set<string>(), boxes = new Set<string>();
  for (let i = 0; i < 20_000; i++) {
    const box = await a.seal("да", id);
    nonces.add(base64url(fromBase64url(box).subarray(0, 12)));
    boxes.add(box);
  }
  assertEquals([nonces.size, boxes.size], [20_000, 20_000]);
});

Deno.test("the length of a message shows through the box: known limit, no padding", async () => {
  const { a } = await setup();
  const id = crypto.randomUUID();
  const short = fromBase64url(await a.seal("да", id)).length, long = fromBase64url(await a.seal("да".repeat(50), id)).length;
  assertEquals(long - short, 2 * 49 * 2); // two bytes per Cyrillic letter: the node reads the exact size of what is said
});

Deno.test("known limits: the node can drop or reorder messages, and replay one to a conversation opened anew", async () => {
  const { a, b, wrapped, wrap } = await setup();
  const first = crypto.randomUUID(), second = crypto.randomUUID();
  const b1 = await a.seal("первое", first), b2 = await a.seal("второе", second);
  assertEquals(await b.open(b2, second), "второе"); // out of order, the first withheld: nothing says so
  assertEquals(await b.open(b1, first), "первое");
  // The seen-nonce set lives in memory: a reload forgets it. Here the sender's own restored side, on the peer's box.
  const fromB = await b.seal("ответ", first);
  const before = await unwrapConversation(wrapped, wrap.privateKey, CHAT, 0, LOW, HIGH);
  assertEquals(await before.open(fromB, first), "ответ");
  const reloaded = await unwrapConversation(wrapped, wrap.privateKey, CHAT, 0, LOW, HIGH);
  assertEquals(await reloaded.open(fromB, first), "ответ");
});
