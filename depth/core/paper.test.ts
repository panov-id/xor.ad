// The paper code against an independent reference: argon2-cffi, the Python
// binding of the reference C implementation, computed the material of
// RTQ48FMK2PZNXW9D under "xor.ad/recovery/v1" on 2026-09-26 (python:3.12-slim,
// 64 MiB, t=3, p=1). The web has to derive the same bytes from the same
// sixteen characters, or a code written here raises nobody there.
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { derivePaperCode, newPaperCode, paperGroups, readPaperCode, unwrapLongKey, wrapLongKey } from "./paper.ts";

const REFERENCE =
  "6f9daeab1863a8a871b2a705ddc7736feb9ef6f3de91e6be8d046d99bbf19aad" +
  "d6eaf79e76c4ad57b43905658dd01c02da1bbb0c170c67e6dc1b6585870cb4c1";
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16));
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

Deno.test("the lookup is the first half of the reference material, base64url", async () => {
  const { lookupId } = await derivePaperCode("RTQ48FMK2PZNXW9D");
  assertEquals(lookupId, b64url(fromHex(REFERENCE.slice(0, 64))), "the lookup is not Argon2id(code)[0..32]");
});

Deno.test("the wrap key is the second half: what it seals, a key made from the reference opens", async () => {
  const { wrapKey } = await derivePaperCode("rtq4-8fmk-2pzn-xw9d");
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const { wrapped } = await wrapLongKey(long.privateKey, wrapKey);
  const reference = await crypto.subtle.importKey("raw", fromHex(REFERENCE.slice(64)), "AES-GCM", false, ["unwrapKey"]);
  const opened = await unwrapLongKey(wrapped, reference);
  const said = new TextEncoder().encode("x");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, opened, said);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, long.publicKey, signature, said),
    "the key opened with the reference half is not the key that was wrapped");
});

Deno.test("the long key that signs is not the one that can be exported", async () => {
  const { wrapKey } = await derivePaperCode(newPaperCode());
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const { privateKey } = await wrapLongKey(long.privateKey, wrapKey);
  assertEquals(privateKey.extractable, false, "the key the client signs with can be exported");
  await assertRejects(() => crypto.subtle.exportKey("pkcs8", privateKey));
});

Deno.test("another code does not open the long key", async () => {
  const mine = await derivePaperCode(newPaperCode());
  const theirs = await derivePaperCode(newPaperCode());
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const { wrapped } = await wrapLongKey(long.privateKey, mine.wrapKey);
  await assertRejects(() => unwrapLongKey(wrapped, theirs.wrapKey));
});

Deno.test("a code is sixteen characters of the alphabet, read back the way people write it", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = newPaperCode();
    assert(/^[0-9A-HJKMNP-TV-Z]{16}$/.test(code), `not a code: ${code}`);
    seen.add(code);
  }
  assertEquals(seen.size, 200, "two codes out of two hundred were the same");
  assertEquals(readPaperCode(" rtq4-8fmk 2pzn-xw9d "), "RTQ48FMK2PZNXW9D");
  assertEquals(readPaperCode("0O1IL-00000000000"), "0011100000000000");
  assertEquals(paperGroups("RTQ48FMK2PZNXW9D"), ["RTQ4", "8FMK", "2PZN", "XW9D"]);
  assertThrows(() => readPaperCode("RTQ48FMK2PZNXW9U"), Error, "16 characters");
  assertThrows(() => readPaperCode("RTQ48FMK2PZNXW9"), Error, "16 characters");
});
