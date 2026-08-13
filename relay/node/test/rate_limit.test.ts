// The limiter exists because the daily key quota is shared by every visitor: a
// bot that burns it does not get refused, it closes signups for everyone. These
// check the properties that make it a limit rather than that lever — per
// address, and it forgets.

import { assertEquals } from "jsr:@std/assert@1";
import { check, checkAll, type Limit, reset } from "../src/lib/rate_limit.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

const LIMIT: Limit = { name: "test", max: 3, windowMs: 60_000 };

configured("allows up to the limit and then refuses", () => {
  reset();
  const now = 1_000_000;
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, true);
  const fourth = check(LIMIT, "1.1.1.1", now);
  assertEquals(fourth.allowed, false);
  assertEquals(fourth.remaining, 0);
});

configured("one address does not spend another's allowance", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  // The whole point: the noisy one is refused, the quiet one is not — which is
  // exactly what the shared key quota could not do.
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, false);
  assertEquals(check(LIMIT, "2.2.2.2", now).allowed, true);
});

configured("the window slides — an old hit stops counting", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  assertEquals(check(LIMIT, "1.1.1.1", now).allowed, false);
  // A minute and a bit later the first three have aged out.
  assertEquals(check(LIMIT, "1.1.1.1", now + 61_000).allowed, true);
});

configured("retry-after points at when the oldest hit expires", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) check(LIMIT, "1.1.1.1", now);
  const refused = check(LIMIT, "1.1.1.1", now + 30_000);
  assertEquals(refused.allowed, false);
  // 60s window, 30s elapsed: about 30 left, and never zero — a client told to
  // retry in zero seconds retries immediately.
  assertEquals(refused.retryAfterSeconds, 30);
});

// Two windows exist because they catch different things: a burst, and a patient
// script that stays under the burst threshold and grinds all day.
const HOURLY: Limit = { name: "two-hourly", max: 3, windowMs: 60_000 };
const DAILY: Limit = { name: "two-daily", max: 5, windowMs: 600_000 };

configured("the daily window catches what the hourly one lets through", () => {
  reset();
  let now = 1_000_000;
  // Three per short window, refilling each time: the hourly limit never fires.
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 3; i++) {
      const verdict = checkAll([HOURLY, DAILY], "1.1.1.1", now);
      if (round === 1 && i === 2) {
        // The sixth hit crosses the daily maximum of five.
        assertEquals(verdict.allowed, false);
      } else {
        assertEquals(verdict.allowed, true);
      }
    }
    now += 61_000; // past the hourly window, still inside the daily one
  }
});

configured("the refusal reported is the window that has to be waited out", () => {
  reset();
  const now = 2_000_000;
  for (let i = 0; i < 3; i++) checkAll([HOURLY, DAILY], "9.9.9.9", now);
  const refused = checkAll([HOURLY, DAILY], "9.9.9.9", now);
  assertEquals(refused.allowed, false);
  // The hourly one filled first, so its 60s — not the daily 600s — is what the
  // caller is told to wait.
  assertEquals(refused.retryAfterSeconds, 60);
});
