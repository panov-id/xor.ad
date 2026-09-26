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

configured("identity ids, mailboxes and other non-addresses keep their own keys, and a suffix stays", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  // A malformed dotted address is held inside IPv6, below: alone its key is its
  // own text whether it is read as an address or not, and proves nothing.
  for (const whole of ["4f0c2a4e-8d7b-4c1e-9f6a-1b2c3d4e5f60", "someone@example.org", "keyless", "not:an:address:at:all"]) {
    assertEquals(bucketAddress(whole), whole, `${whole} was taken for an address`);
  }
  assertEquals(bucketAddress("2001:db8:1:2::5|pk_live_x"), "2001:db8:1:2::/64|pk_live_x", "an IPv6 address with a key suffix kept its full address");
  assertEquals(bucketAddress("::ffff:203.0.113.7|pk_live_x"), "203.0.113.7|pk_live_x", "an IPv4 host behind a suffix kept its IPv6 spelling");
  assertEquals(bucketAddress("::1"), "0:0:0:0::/64", "the loopback did not fold");
});

// One IPv4 host, one bucket, however a header spells it (B92, B99): dotted,
// padded, bracketed, and inside IPv6 in each of the four ways an IPv4 address
// rides there — mapped ::ffff:0:0/96 (RFC 4291 §2.5.5.2), translated
// ::ffff:0:0:0/96 (RFC 2765 §2.1), the old compatible ::/96 (RFC 4291
// §2.5.5.1), and NAT64's well-known 64:ff9b::/96 (RFC 6052 §2.1) — dotted or in
// hex. B92 kept mapped and compatible whole in their own spelling, so one host
// had a bucket per spelling, and folded translated and NAT64 hex into the /64
// they share with every other IPv4 host written that way.
configured("one IPv4 host has one bucket however it is written, and two hosts never share one", async () => {
  reset();
  const { bucketAddress, TRANSFER_CLAIM_LIMITS } = await import("../src/lib/rate_limit.ts");
  const spellings = [
    "192.0.2.128", " 192.0.2.128 ", "192.000.002.128",
    "::ffff:192.0.2.128", "::FFFF:C000:280", "0:0:0:0:0:ffff:c000:280", "[::ffff:192.0.2.128]",
    "::ffff:0:c000:280", "::ffff:0:192.0.2.128",
    "::c000:280", "::192.0.2.128",
    "64:ff9b::c000:280", "64:FF9B::192.0.2.128", "64:ff9b:0:0:0:0:c000:280",
  ];
  for (const spelling of spellings) {
    assertEquals(bucketAddress(spelling), "192.0.2.128", `${JSON.stringify(spelling)} is 192.0.2.128 and got the bucket ${bucketAddress(spelling)}`);
  }
  const now = Date.now();
  const max = TRANSFER_CLAIM_LIMITS[0].max;
  for (let i = 0; i < max; i++) checkAll(TRANSFER_CLAIM_LIMITS, spellings[i % spellings.length], now);
  for (const spelling of spellings) {
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, spelling, now).allowed, false,
      `${JSON.stringify(spelling)} walked past 192.0.2.128's ceiling of ${max} in a bucket of its own`);
  }
  // And the next host, in every form, is its own.
  for (const other of ["192.0.2.129", "::ffff:c000:281", "::ffff:0:c000:281", "::c000:281", "64:ff9b::c000:281"]) {
    assertEquals(checkAll(TRANSFER_CLAIM_LIMITS, other, now).allowed, true,
      `${other} was refused for 192.0.2.128's claims: two IPv4 hosts in one bucket`);
  }
});

// The four prefixes are exact: one group off inside the zeros each needs, and
// the address is an ordinary IPv6 host folded to its /64, not an IPv4 host
// (B104, from the observer's probe on B99 — NAT64 checked one zero group
// short, and every case stayed green).
configured("an address one group off an IPv4-carrying prefix is IPv6, folded to its /64", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  const cases: [string, string][] = [
    // NAT64 64:ff9b::/96 — groups 2 to 5 zero, and 64:ff9b itself.
    ["64:ff9b:1:0:0:0:c000:280", "64:ff9b:1:0::/64"],
    ["64:ff9b:0:1:0:0:c000:280", "64:ff9b:0:1::/64"],
    ["64:ff9b:0:0:1:0:c000:280", "64:ff9b:0:0::/64"],
    ["64:ff9b:0:0:0:1:c000:280", "64:ff9b:0:0::/64"],
    ["64:ff9a::c000:280", "64:ff9a:0:0::/64"],
    ["65:ff9b::c000:280", "65:ff9b:0:0::/64"],
    // Mapped ::ffff:0:0/96 — groups 0 to 4 zero.
    ["0:0:0:0:1:ffff:c000:280", "0:0:0:0::/64"],
    ["0:0:0:1:0:ffff:c000:280", "0:0:0:1::/64"],
    ["1::ffff:c000:280", "1:0:0:0::/64"],
    // Translated ::ffff:0:0:0/96 — groups 0 to 3 zero, then ffff, then 0.
    ["0:0:0:1:ffff:0:c000:280", "0:0:0:1::/64"],
    ["0:0:0:0:ffff:1:c000:280", "0:0:0:0::/64"],
    // Compatible ::/96 — groups 0 to 5 zero.
    ["0:0:0:0:0:1:c000:280", "0:0:0:0::/64"],
    ["0:0:0:0:1:0:c000:280", "0:0:0:0::/64"],
  ];
  for (const [address, bucket] of cases) {
    assertEquals(bucketAddress(address), bucket,
      `${address} is not one of the four IPv4-carrying prefixes and was read as the IPv4 host ${bucketAddress(address)}`);
  }
});

// An octet past 255 makes no IPv4 host, and neither does a dotted tail short
// or long of four (B104, from the coordinator's verifier on B99). Checked
// inside IPv6, where a wrong reading shows: "256.1.1.1" alone keeps its own
// text as its key whether it is read as an address or not, but
// ::ffff:1.256.1.1 read with an octet up to 999 became 1.0.1.1 — another
// host's bucket.
configured("a dotted tail inside IPv6 with an octet past 255, or not four octets, is no address", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  for (const broken of [
    "::ffff:1.256.1.1", "::ffff:256.1.1.1", "::ffff:1.1.1.999", "64:ff9b::300.1.1.1", "::1.2.3.256",
    "::ffff:1.2.3", "::ffff:1.2.3.4.5", "64:ff9b::1..2.3", "::ffff:1.2.3.-4",
  ]) {
    assertEquals(bucketAddress(broken), broken, `${broken} is no address and was read as ${bucketAddress(broken)}`);
  }
});

// "::" stands for one or more zero groups anywhere in the address (RFC 4291
// §2.2); every place it can stand, and the address written out in full, is one
// /64. Nothing held this before B99.
configured("an IPv6 address folds to the same /64 wherever its :: stands, and written out in full", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  const cases: [string, string][] = [
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["2001:db8:0:0:0:0:0:1", "2001:db8:0:0::/64"],
    ["2001:0db8:0000:0000:0000::0001", "2001:db8:0:0::/64"],
    ["2001:db8:0:0:1::", "2001:db8:0:0::/64"],
    ["::2001:db8:1:2", "0:0:0:0::/64"],
    ["::", "0:0:0:0::/64"],
    ["2001:db8:a:b:c:d:e:f", "2001:db8:a:b::/64"],
    ["2001:db8:a:b::", "2001:db8:a:b::/64"],
    ["fe80::1%25eth0", "fe80:0:0:0::/64"],
  ];
  for (const [address, bucket] of cases) {
    assertEquals(bucketAddress(address), bucket, `${address} folded to ${bucketAddress(address)}`);
  }
  for (const broken of ["2001:db8::1::2", "2001:db8:1:2:3:4:5:6:7", "2001:db8:12345::1", ":::"]) {
    assertEquals(bucketAddress(broken), broken, `${broken} is not an address and was folded`);
  }
});

// B76's own rule, over addresses the case does not choose (B99): a global IPv6
// address folds to its first four groups. Held by value against a /64 worked
// out here, not by the function under test.
configured("random global IPv6 addresses fold to their own /64", async () => {
  const { bucketAddress } = await import("../src/lib/rate_limit.ts");
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16);
  for (let i = 0; i < 2000; i++) {
    const groups = [(0x2000 + Math.floor(Math.random() * 0x1000)).toString(16), hex(), hex(), hex(), hex(), hex(), hex(), hex()];
    const expected = `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
    assertEquals(bucketAddress(groups.join(":")), expected, `${groups.join(":")} folded wrong`);
    assertEquals(bucketAddress(groups.join(":").toUpperCase()), expected, `${groups.join(":").toUpperCase()} folded wrong`);
  }
});
