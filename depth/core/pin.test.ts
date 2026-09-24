// The PIN derivation against an independent reference: argon2-cffi, the Python
// binding of the reference C implementation, computed the same material on
// 2026-09-24 (python:3.12-slim). Two implementations agreeing is the check;
// a test that only compares this code with itself would prove nothing.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { derivePin, newDeviceSalt } from "./pin.ts";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const REFERENCE =
  "245684479cb9f5c26a8aa8777c4bbcd79cea980499082ec0b854bab417d346f4" +
  "8723adf8623ac2f051fe45f539f826fbfb729d52a52d3afbbb5d8ea465cedfe0";

Deno.test("the PIN material matches the reference implementation, split into auth and local", async () => {
  const { auth, local } = await derivePin("482913", new Uint8Array(16).fill(7));
  assertEquals(hex(auth), REFERENCE.slice(0, 64), "auth is not the first half of Argon2id(64 MiB, t=3, p=1)");
  assertEquals(hex(local), REFERENCE.slice(64), "local is not the second half");
});

Deno.test("another device salt gives another proof, and a PIN is six digits", async () => {
  const one = await derivePin("482913", newDeviceSalt());
  const two = await derivePin("482913", newDeviceSalt());
  assertEquals(hex(one.auth) === hex(two.auth), false, "two devices derived the same proof from one PIN");
  await assertRejects(() => derivePin("12345", newDeviceSalt()), Error, "six digits");
});
