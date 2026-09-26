// The transfer code and its two envelopes, against an independent reference:
// argon2-cffi, the Python binding of the reference C implementation, computed
// the material of K7QM3F2X9 under "xor.ad/device-link/v1" on 2026-09-26
// (python:3.12-slim, 64 MiB, t=3, p=1). The web has to derive the same bytes
// from the same nine characters, or a code shown here moves nobody there.
import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  checkCharacters, type Claimant, deriveTransferCode, HeldKey, newTransferCode, openClaim, openReply,
  readTransferCode, sealClaim, sealReply, transferGroups,
} from "./transfer.ts";
import { base64url } from "./sign.ts";
import { newPaperCode } from "./paper.ts";

const REFERENCE =
  "28694650caf73d3b30d38fe180fdbfdb3256a1c7994c3095aca53144d21f6d21" +
  "6c9ab804254f67daaaeeadf3cd6a22cbeef0cab6cada651c04693d38dfa6fc0f";
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16));

const spki = async (key: CryptoKey) => base64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

// A new device as the terminal makes one: a signing pair and a wrapping pair.
async function newDevice(label = "depth, linux"): Promise<{ claimant: Claimant; wrapPrivate: CryptoKey }> {
  const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
  return { claimant: { sign_pub: await spki(sign.publicKey), wrap_pub: await spki(wrap.publicKey), label }, wrapPrivate: wrap.privateKey };
}

async function longKey(): Promise<{ held: HeldKey; pub: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  return { held: await HeldKey.hold(pair.privateKey), pub: await spki(pair.publicKey), publicKey: pair.publicKey };
}

Deno.test("the lookup and the secret are the two halves of the reference material", async () => {
  const keys = await deriveTransferCode("k7q-m3f-2x9");
  assertEquals(keys.lookupId, base64url(fromHex(REFERENCE.slice(0, 64))), "the lookup is not Argon2id(code)[0..32]");
  assertEquals([...keys.secret], [...fromHex(REFERENCE.slice(64))], "the secret is not Argon2id(code)[32..64]");
});

Deno.test("a code is nine characters of the alphabet, shown in threes and read back the way people type", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = newTransferCode();
    assert(/^[0-9A-HJKMNP-TV-Z]{9}$/.test(code), `not a code: ${code}`);
    seen.add(code);
  }
  assertEquals(seen.size, 200, "two codes out of two hundred were the same");
  assertEquals(readTransferCode(" k7q-m3f 2x9 "), "K7QM3F2X9");
  assertEquals(readTransferCode("OIL-000-000"), "011000000");
  assertEquals(transferGroups("K7QM3F2X9"), ["K7Q", "M3F", "2X9"]);
  // One alphabet for both codes (§8.2): every character the paper code is
  // made of reads here, and the transfer code is made of no other.
  const paper = new Set([...Array(50)].flatMap(() => [...newPaperCode()]));
  assertEquals(paper.size, 32, "fifty paper codes did not show the whole alphabet");
  for (const c of paper) assertEquals(readTransferCode(c.repeat(9)), c.repeat(9));
  for (const c of [...Array(50)].flatMap(() => [...newTransferCode()])) assert(paper.has(c), `${c} is not in the paper code's alphabet`);
  assertThrows(() => readTransferCode("K7QM3F2XU"), Error, "9 characters");
  assertThrows(() => readTransferCode("K7QM3F2X"), Error, "9 characters");
});

Deno.test("the claim opens with the same code and with no other", async () => {
  const keys = await deriveTransferCode("K7QM3F2X9");
  const { claimant } = await newDevice("Chrome, Android");
  const envelope = await sealClaim(keys, claimant);
  assertEquals(await openClaim(keys, envelope), claimant);
  await assertRejects(async () => await openClaim(await deriveTransferCode("K7QM3F2X8"), envelope));
});

Deno.test("the check characters are the first twenty bits of sha256(sign ‖ wrap), high bits first", async () => {
  const { claimant } = await newDevice();
  const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));
  const joined = new Uint8Array([...bytes(claimant.sign_pub), ...bytes(claimant.wrap_pub)]);
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
  const bits = [...d.slice(0, 3)].map((b) => b.toString(2).padStart(8, "0")).join("").slice(0, 20);
  const expected = [0, 5, 10, 15].map((at) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[parseInt(bits.slice(at, at + 5), 2)]).join("");
  assertEquals(await checkCharacters(claimant), expected, "the check characters are not the high twenty bits");
  const other = await newDevice();
  assertNotEquals(await checkCharacters(other.claimant), "", "no check characters for a second device");
});

Deno.test("the reply carries the long key to the device that claimed, and it signs as the long key", async () => {
  const keys = await deriveTransferCode(newTransferCode());
  const arriving = await newDevice();
  const long = await longKey();
  const reply = await sealReply(keys, arriving.claimant, { identityId: "id-1", longPub: long.pub }, long.held);
  const got = await openReply(keys, arriving.claimant, arriving.wrapPrivate, reply);
  assertEquals([got.identityId, got.longPub], ["id-1", long.pub]);
  assertEquals(got.signing.extractable, false, "the long key the new device signs with can be exported");
  const said = new TextEncoder().encode("x");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, got.signing, said);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, long.publicKey, signature, said),
    "the key that arrived is not the long key that left");
});

Deno.test("whoever heard the code read out cannot open the reply: it is sealed to the claimant's wrapping key", async () => {
  const keys = await deriveTransferCode(newTransferCode());
  const arriving = await newDevice();
  const eavesdropper = await newDevice();
  const long = await longKey();
  const reply = await sealReply(keys, arriving.claimant, { identityId: "id-1", longPub: long.pub }, long.held);
  await assertRejects(async () => await openReply(keys, arriving.claimant, eavesdropper.wrapPrivate, reply));
});

Deno.test("a reply approved for one pair does not open as a reply for another", async () => {
  const keys = await deriveTransferCode(newTransferCode());
  const arriving = await newDevice();
  const long = await longKey();
  const reply = await sealReply(keys, arriving.claimant, { identityId: "id-1", longPub: long.pub }, long.held);
  const swapped = { ...arriving.claimant, sign_pub: (await newDevice()).claimant.sign_pub };
  await assertRejects(async () => await openReply(keys, swapped, arriving.wrapPrivate, reply));
});

Deno.test("a header naming another long key is refused, not trusted", async () => {
  const keys = await deriveTransferCode(newTransferCode());
  const arriving = await newDevice();
  const long = await longKey();
  const liar = await longKey();
  const reply = await sealReply(keys, arriving.claimant, { identityId: "id-1", longPub: liar.pub }, long.held);
  await assertRejects(async () => await openReply(keys, arriving.claimant, arriving.wrapPrivate, reply), Error, "not the one its header names");
});

Deno.test("the held long key signs but cannot be exported outside use", async () => {
  const long = await longKey();
  const signing = await long.held.signing();
  assertEquals(signing.extractable, false);
  await assertRejects(() => crypto.subtle.exportKey("pkcs8", signing));
});

// B28 · a reply whose header is broken or short is refused in fixed words:
// the header comes before anything is authenticated, and a parser's message
// would carry the sender's bytes — escapes included — onto the screen.
Deno.test("a reply with a broken or short header is refused without echoing its bytes", async () => {
  const keys = await deriveTransferCode(newTransferCode());
  const arriving = await newDevice();
  const evil = new TextEncoder().encode("\u001b]0;pwn\u0007{");
  const bytes = new Uint8Array(2 + evil.length + 28);
  bytes[1] = evil.length;
  bytes.set(evil, 2);
  const broken = await assertRejects(() => openReply(keys, arriving.claimant, arriving.wrapPrivate, base64url(bytes)));
  assertEquals((broken as Error).message, "the reply header is not JSON");
  const short = await assertRejects(() => openReply(keys, arriving.claimant, arriving.wrapPrivate, base64url(new Uint8Array([0, 200, 1, 2]))));
  assertEquals((short as Error).message, "the reply is shorter than its own header says");
});
