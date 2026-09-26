// The limiter exists because the daily key quota is shared by every visitor: a
// bot that burns it does not get refused, it closes signups for everyone. These
// check the properties that make it a limit rather than that lever — per
// address, and it forgets.

import { assert, assertEquals } from "jsr:@std/assert@1";
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

// A request one window refuses spends nothing in the others. checkAll recorded
// a hit in each window as it passed, so when the daily window refused, the
// hourly one had already been spent on a request that never went through: the
// next attempt was refused by the hour, and Retry-After jumped from a day to an
// hour and back (loop quorum, 2026-09-24).
const BURST: Limit = { name: "spent-burst", max: 3, windowMs: 3_600_000 };
const DAY: Limit = { name: "spent-day", max: 2, windowMs: 86_400_000 };

configured("a refusal by one window spends no slot of another", () => {
  reset();
  const now = 3_000_000;
  assertEquals(checkAll([BURST, DAY], "5.5.5.5", now).allowed, true);
  assertEquals(checkAll([BURST, DAY], "5.5.5.5", now).allowed, true);
  const first = checkAll([BURST, DAY], "5.5.5.5", now);
  assertEquals(first.allowed, false);
  const second = checkAll([BURST, DAY], "5.5.5.5", now);
  assertEquals(second.allowed, false);
  assertEquals(second.retryAfterSeconds, first.retryAfterSeconds,
    "the refused request spent the hourly window, and the wait the caller is told changed");
  // The hourly window holds the two requests that went through, not the refused ones.
  assertEquals(check(BURST, "5.5.5.5", now).remaining, 0, "the burst window holds more or fewer than the two that passed plus this one");
});

// The transfer state poll and the claim count apart (B10, 2026-09-26): two
// devices polling every five seconds spent the claim's sixty in two and a half
// minutes. The claim keeps its own allowance (ten since B58) and the poll its
// own six hundred.
configured("the transfer poll and the transfer claim spend separate allowances", async () => {
  const { TRANSFER_CLAIM_LIMITS, TRANSFER_STATE_LIMITS } = await import("../src/lib/rate_limit.ts");
  reset();
  const now = 4_000_000;
  for (let i = 0; i < 600; i++) {
    assertEquals(checkAll(TRANSFER_STATE_LIMITS, "6.6.6.6", now).allowed, true, `poll ${i + 1} of 600 refused`);
  }
  assertEquals(checkAll(TRANSFER_STATE_LIMITS, "6.6.6.6", now).allowed, false, "the 601st poll in an hour went through");
  const claims = TRANSFER_CLAIM_LIMITS[0].max;
  for (let i = 0; i < claims; i++) {
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "6.6.6.6", now).allowed, true,
      `claim ${i + 1} of ${claims} refused after the polls — they spent the claim's allowance`);
  }
  assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "6.6.6.6", now).allowed, false, `the claim no longer stops at ${claims} an hour`);
});

// The claim's numbers held here too, not only by the route suite (B66): ten an
// hour and thirty a day per address (limits.tsv transfer.claim.hour / .day,
// B58). Written as numbers, not read from the list — a test that reads the
// value it checks follows the value wherever it goes, and sixty went through
// that way until B58. Walked over a day, so the daily window is seen doing
// its own refusing, and held under the node-wide brake one address must not
// reach on its own (lib/recovery_misses.ts TRANSFER, review panel 3, S3).
configured("the transfer claim stops at ten an hour and thirty a day, under the node-wide brake", async () => {
  const { TRANSFER_CLAIM_LIMITS } = await import("../src/lib/rate_limit.ts");
  const { TRANSFER } = await import("../src/lib/recovery_misses.ts");
  reset();
  const start = 5_000_000;
  const hour = 60 * 60 * 1000;
  for (let i = 0; i < 10; i++) {
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "7.7.7.7", start).allowed, true, `claim ${i + 1} of 10 in the first hour refused`);
  }
  assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "7.7.7.7", start).allowed, false, "the 11th claim in an hour went through: the hourly ceiling is no longer 10");
  // Two more hours of ten: thirty in the day, each hour full to its own ceiling.
  for (let h = 1; h <= 2; h++) {
    for (let i = 0; i < 10; i++) {
      assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "7.7.7.7", start + h * hour + 1).allowed, true,
        `claim ${h * 10 + i + 1} of 30 in the day refused in hour ${h + 1}`);
    }
  }
  const fourthHour = checkAll(TRANSFER_CLAIM_LIMITS, "7.7.7.7", start + 3 * hour + 1);
  assertEquals(fourthHour.allowed, false, "the 31st claim in a day went through in a fresh hour: the daily ceiling is no longer 30");
  assert(fourthHour.retryAfterSeconds > 3600, `the 31st claim was refused by the hour, not the day (Retry-After ${fourthHour.retryAfterSeconds} s)`);
  // Another address is untouched by all of it.
  assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "8.8.8.8", start + 3 * hour + 1).allowed, true, "one address's thirty spent another's");
  assert(10 < TRANSFER.max, `one address's hourly ten reaches the node-wide brake of ${TRANSFER.max}`);
});

// An IPv6 caller counts by its /64 (review panel 4, К6, B76): one host picks
// any address of its /64, and a bucket per full address let it claim transfer
// codes past the ceiling that keeps one hand off the node-wide brake.
configured("addresses of one IPv6 /64 share a bucket, and a neighbouring /64 does not", async () => {
  reset();
  const { TRANSFER_CLAIM_LIMITS } = await import("../src/lib/rate_limit.ts");
  const now = Date.now();
  const max = TRANSFER_CLAIM_LIMITS[0].max;
  for (let i = 0; i < max; i++) {
    const host = `2001:db8:1:2:${(i + 1).toString(16)}::${(i * 7 + 3).toString(16)}`;
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, host, now).allowed, true, `claim ${i + 1} from the /64 refused`);
  }
  // A fresh address in the same /64, spelled every way a header may bring it.
  for (const same of ["2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:0DB8:0001:0002::1", "[2001:db8:1:2::99]", "2001:db8:1:2::5%eth0"]) {
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, same, now).allowed, false,
      `${same} got a bucket of its own: the /64 walked past its ceiling of ${max}`);
  }
  assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, "2001:db8:1:3::1", now).allowed, true, "the neighbouring /64 was refused for this one's claims");
});

configured("IPv4, IPv4-mapped IPv6, identity ids and suffixed buckets keep their own keys", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  for (const whole of ["203.0.113.7", "::ffff:203.0.113.7", "4f0c2a4e-8d7b-4c1e-9f6a-1b2c3d4e5f60", "someone@example.org", "keyless", "not:an:address:at:all"]) {
    assertEquals(bucketAddress(whole), whole, `${whole} was folded`);
  }
  assertEquals(bucketAddress("2001:db8:1:2::5|pk_live_x"), "2001:db8:1:2::/64|pk_live_x", "an IPv6 address with a key suffix kept its full address");
  assertEquals(bucketAddress("::1"), "0:0:0:0::/64", "the loopback did not fold");
});
