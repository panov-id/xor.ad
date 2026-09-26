// The public half of a long key opened by the paper code, taken without the
// private scalar ever becoming a string (review panel 2026-09-26, F22).
import { assertEquals } from "jsr:@std/assert@1";
import { base64url } from "./sign.ts";
import { publicHalf } from "./recovery.ts";

Deno.test("the public half comes from zeroed pkcs8 bytes, never from a JWK with its d", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const expected = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
  const formats: string[] = [];
  const handed: ArrayBuffer[] = [];
  const real = crypto.subtle.exportKey.bind(crypto.subtle);
  // deno-lint-ignore no-explicit-any
  (crypto.subtle as any).exportKey = async (format: KeyFormat, key: CryptoKey) => {
    formats.push(`${format}:${key.type}`);
    const out = await real(format as "pkcs8", key);
    if (format === "pkcs8") handed.push(out as ArrayBuffer);
    return out;
  };
  try {
    assertEquals(await publicHalf(pair.privateKey), expected, "the half is not the key's public half");
  } finally {
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).exportKey = real;
  }
  assertEquals(formats.filter((f) => f.endsWith(":private")), ["pkcs8:private"], "the private key left as something else than pkcs8");
  assertEquals(new Uint8Array(handed[0]).every((b) => b === 0), true, "the pkcs8 bytes were not wiped");
});

// A pkcs8 that leaves out the public point — RFC 5915 lets it, and the web's
// own wraps have not been checked for what browsers write (d1, 2026-09-26).
// Raising must still work: the half is then taken the old way, through the
// JWK, the one case where `d` lives as a string.
Deno.test("a long key whose pkcs8 has no public point still gives its public half", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const expected = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
  const full = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const d = full.slice(36, 68);
  const prefix = "3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420";
  const bare = new Uint8Array([...prefix.match(/../g)!.map((h) => parseInt(h, 16)), ...d]);
  const key = await crypto.subtle.importKey("pkcs8", bare, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const exported = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key));
  // The runtime keeps the short form: this is the case under test.
  assertEquals(exported.length, 67, "the runtime added the point back; the case is not reached");
  assertEquals(await publicHalf(key), expected, "a key without the point in its pkcs8 gave no public half");
});
