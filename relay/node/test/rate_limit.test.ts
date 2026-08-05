// The limiter exists because the daily key quota is shared by every visitor: a
// bot that burns it does not get refused, it closes signups for everyone. These
// check the properties that make it a limit rather than that lever — per
// address, and it forgets.

import { assertEquals } from "jsr:@std/assert@1";
import { check, type Limit, reset } from "../src/lib/rate_limit.ts";

const LIMIT: Limit = { name: "test", max: 3, windowMs: 60_000 };

Deno.test("allows up to the limit and then refuses", () => {
  reset();
  const now = 1_000_000;
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  const fourth = check(LIMIT, "1.1.1.1", now);
  assertEquals(fourth.allowed, false);
  assertEquals(fourth.remaining, 0);
});

Deno.test("one address does not spend another's allowance", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  // The whole point: the noisy one is refused, the quiet one is not — which is
  // exactly what the shared key quota could not do.
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, false);
  assertEquals(check(LIMIT, "2.2.2.2", now).allowed, true);
});

Deno.test("the window slides — an old hit stops counting", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, false);
  // A minute and a bit later the first three have aged out.
  assertEquals(check(LIMIT, "1.1.1.1", now + 61_000).allowed, true);
});

Deno.test("retry-after points at when the oldest hit expires", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  const refused = check(LIMIT, "1.1.1.1", now + 30_000);
  assertEquals(refused.allowed, false);
  // 60s window, 30s elapsed: about 30 left, and never zero — a client told to
  // retry in zero seconds retries immediately.
  assertEquals(refused.retryAfterSeconds, 30);
});
