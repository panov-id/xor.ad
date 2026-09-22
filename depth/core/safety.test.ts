// The safety code of §8.13: the same on both sides, bound to the long keys
// only, and different the moment either long key is someone else's.

import { assertEquals, assertMatch, assertNotEquals, assertRejects } from "jsr:@std/assert@1";
import { safetyCode } from "./seal.ts";
import { generateSigningKey } from "./sign.ts";

Deno.test("both sides compute the same code, grouped four by four", async () => {
  const a = await generateSigningKey();
  const b = await generateSigningKey();
  const mine = await safetyCode(a.publicSpki, b.publicSpki);
  assertMatch(mine, /^\d{4} \d{4} \d{4} \d{4} \d{4}$/, "the code is twenty digits in five groups");
  assertEquals(await safetyCode(b.publicSpki, a.publicSpki), mine, "the peer sees another code");
});

Deno.test("a swapped long key gives another code", async () => {
  const a = await generateSigningKey();
  const b = await generateSigningKey();
  const intruder = await generateSigningKey();
  assertNotEquals(
    await safetyCode(a.publicSpki, intruder.publicSpki),
    await safetyCode(a.publicSpki, b.publicSpki),
    "a node that swaps a key goes unnoticed",
  );
});

Deno.test("a key that is not a P-256 point is refused, not hashed", async () => {
  const a = await generateSigningKey();
  // Well-formed SPKI framing around bytes that are no point on the curve.
  const offCurve = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4_QA";
  await assertRejects(() => safetyCode(a.publicSpki, offCurve));
});

Deno.test("a fixed pair of real keys gives a fixed code (the derivation does not drift)", async () => {
  // Two real P-256 keys; the expected code was computed by a separate Python
  // implementation of §8.13 — the web face must agree with both.
  const a = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzSV91C3t3StmdyIIim7VrPILxhSB3gJmuCS20-NTH8wYcXO0etbORqlyGo2dsiXDAA9SjDD7JblZxtIkkVCL4A";
  const b = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGImQT9GU6xtxHLRXZOYQyBYfnmG0P9zrIk-9Bhngqg65WlMIPDMTIJVnDYyat5dacJcZVw6jB_q7Ik0OmfJjQQ";
  assertEquals(await safetyCode(a, b), "5079 0098 2219 6667 9602");
});
