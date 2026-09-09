// What bounds a stolen publishable key.
//
// The key ships inside a landing page, and the Origin allowlist beside it is a
// hint browsers honour rather than a check anyone must pass — `curl -H 'Origin:
// …'` wears somebody else's key without effort. So the boundary is not who
// holds the key: it is what holding it can spend.
//
// Two things were missing. /pageview and /client-error had no per-address limit
// at all, which made them the cheapest way to fill another tenant's storage.
// And one daily counter served every metered route, so spending it on page
// views left that tenant's sign-up form answering 429 until midnight UTC — a
// denial of service against a competitor, from their own published key.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT_ERROR_LIMITS,
  checkAll,
  PAGEVIEW_LIMITS,
  REPORT_LIMITS,
  reset,
  V1_LIMITS,
  WAITLIST_LIMITS,
} from "../src/lib/rate_limit.ts";
import { callerBucket } from "../src/lib/client_ip.ts";
import { EVENTS, PAGEVIEWS } from "../src/lib/quota.ts";
import { QUOTA_COLUMNS } from "../src/lib/api_key.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

const request = (address: string, key: string | null) =>
  new Request("https://relay.test/pageview", {
    method: "POST",
    headers: {
      "x-forwarded-for": address,
      ...(key ? { "x-api-key": key } : {}),
    },
  });

configured("the two silent routes have a limit at all", () => {
  // They had none. Everything else here depends on that not being true again.
  assert(PAGEVIEW_LIMITS.length > 0, "/pageview has no rate limit");
  assert(CLIENT_ERROR_LIMITS.length > 0, "/client-error has no rate limit");
  for (const limits of [PAGEVIEW_LIMITS, CLIENT_ERROR_LIMITS]) {
    assert(limits.every((limit) => limit.max > 0 && limit.windowMs > 0));
  }
});

// Ids as they are actually minted: `ak_pub_` and 32 hex (lib/api_key.ts). The
// shape matters to the bucket since 2026-09-08, so the fixtures have to be real
// ones — with `ak_pub_aaa` these cases passed while testing nothing.
const KEY_A = "ak_pub_" + "a".repeat(32);
const KEY_B = "ak_pub_" + "b".repeat(32);

configured("the bucket is the address and the key together", () => {
  const address = "203.0.113.7";
  assert(callerBucket(request(address, KEY_A)) !== callerBucket(request(address, KEY_B)));
  assertEquals(callerBucket(request(address, KEY_A)), callerBucket(request(address, KEY_A)));
  // A caller naming nobody shares one bucket, which is the right answer for
  // traffic that named nobody.
  assertEquals(callerBucket(request(address, null)), `${address}|keyless`);
});

// The bucket name is built before anything resolves the key, so an unshaped
// header would be a free bucket per request — and fifty thousand of those used
// to wipe every counter on the node. Anything that is not a key id shares one
// bucket, and two different pieces of junk must not get two.
configured("junk in the key header does not buy a bucket of its own", () => {
  const address = "203.0.113.9";
  const first = callerBucket(request(address, crypto.randomUUID()));
  const second = callerBucket(request(address, crypto.randomUUID()));
  assertEquals(first, second, "two malformed keys must share one bucket");
  assertEquals(first, `${address}|malformed`);
  assert(first !== callerBucket(request(address, null)), "malformed is not the same as absent");
  assert(first !== callerBucket(request(address, KEY_A)), "junk must not share with a real key");
});

configured("one tenant's noisy visitor does not silence that address for another", () => {
  reset();
  const address = "203.0.113.8";
  const hourly = PAGEVIEW_LIMITS[0].max;
  const noisy = callerBucket(request(address, KEY_A));
  for (let i = 0; i < hourly; i++) checkAll(PAGEVIEW_LIMITS, noisy);
  assertEquals(checkAll(PAGEVIEW_LIMITS, noisy).allowed, false);

  // Same address, another tenant's key: untouched.
  const other = callerBucket(request(address, KEY_B));
  assertEquals(checkAll(PAGEVIEW_LIMITS, other).allowed, true);
});

configured("running out of page views leaves the sign-up form alone", () => {
  reset();
  const bucket = callerBucket(request("203.0.113.9", "ak_pub_x"));
  for (let i = 0; i < PAGEVIEW_LIMITS[0].max; i++) checkAll(PAGEVIEW_LIMITS, bucket);
  assertEquals(checkAll(PAGEVIEW_LIMITS, bucket).allowed, false);
  // The waitlist counts in its own windows, under its own names.
  assertEquals(checkAll(WAITLIST_LIMITS, bucket).allowed, true);
});

configured("the two families count in different cells and against different columns", () => {
  // The whole point of the split: had these stayed one name, the fix would be
  // cosmetic — the same counter row, the same allowance, the same denial.
  //
  // Writing it as `EVENTS !== PAGEVIEWS` does not compile: the literal types do
  // not overlap, which is the compiler saying it already holds. So what is
  // asserted here is the pair of values, and it is these the migration and the
  // quota table have to agree with.
  assertEquals(EVENTS, "events");
  assertEquals(PAGEVIEWS, "pageviews");
  assertEquals(QUOTA_COLUMNS.events, "quota_events_per_day");
  assertEquals(QUOTA_COLUMNS.pageviews, "quota_pageviews_per_day");

  // The migration has to have created the column the code reads, or every limit
  // above is enforced against a number that is always null.
  const migrations = Deno.readTextFileSync(
    new URL("../db/009_api_key_quota_per_family.sql", import.meta.url),
  );
  assert(
    migrations.includes(QUOTA_COLUMNS.pageviews),
    `no migration adds ${QUOTA_COLUMNS.pageviews}`,
  );
});

// Filling the map must not be a way to switch the limiter off.
//
// Until 2026-09-08 crossing MAX_TRACKED cleared every bucket, so a caller who
// could mint buckets — and an unshaped key header let them — decided when the
// counters on the waitlist and on Article 16 notices went back to zero. The
// sweep drops what has expired and leaves what has not: this case fills the map
// past the limit with one-hit buckets and then checks that a caller who is
// already over their limit is still over it.
configured("filling the limiter's map does not reset a live counter", () => {
  reset();
  const victim = "203.0.113.10|" + "ak_pub_" + "c".repeat(32);
  const hourly = PAGEVIEW_LIMITS[0].max;
  for (let i = 0; i < hourly; i++) checkAll(PAGEVIEW_LIMITS, victim);
  assertEquals(checkAll(PAGEVIEW_LIMITS, victim).allowed, false, "the victim must be over the limit");

  // Past MAX_TRACKED (50 000) with buckets that are already expired: each is
  // stamped an hour and a half ago, older than any window in play.
  const stale = Date.now() - 90 * 60 * 1000;
  for (let i = 0; i < 50_001; i++) checkAll(PAGEVIEW_LIMITS, `flood-${i}`, stale);

  assertEquals(
    checkAll(PAGEVIEW_LIMITS, victim).allowed,
    false,
    "a flood of throwaway buckets must not hand the victim their limit back",
  );
});

// Flooding a cheap limit must not evict the expensive one's counters.
//
// The first eviction sorted by raw hit count, and the limits are not
// comparable: `report` allows ten an hour, `pageview` six hundred. A bucket at
// its report limit holds ten hits, a half-idle pageview bucket holds twenty —
// so the sort put every Article 16 counter at the front of the queue and
// flooding /pageview handed a reporter their limit back. Which is the prize the
// wholesale clear used to give away, only reached by a longer road.
configured("flooding a cheap limit does not evict a counter at its own limit", () => {
  reset();
  const victim = "203.0.113.11|" + "ak_pub_" + "d".repeat(32);
  const hourly = REPORT_LIMITS[0].max;
  for (let i = 0; i < hourly; i++) checkAll(REPORT_LIMITS, victim);
  assertEquals(checkAll(REPORT_LIMITS, victim).allowed, false, "the victim is at its report limit");

  // Fill the map with pageview buckets that are busy but nowhere near their own
  // ceiling: more hits each than the victim has, and a smaller share of their
  // limit. Under the old sort these outranked the victim and it went first.
  const perBucket = REPORT_LIMITS[0].max * 2;
  for (let i = 0; i < 50_001; i++) {
    for (let hit = 0; hit < perBucket; hit++) checkAll(PAGEVIEW_LIMITS, `flood-cheap-${i}`);
  }

  assertEquals(
    checkAll(REPORT_LIMITS, victim).allowed,
    false,
    "a reporter at their limit must not get it back because somebody flooded /pageview",
  );
});

// The v1 surface had no per-address ceiling at all. The daily quota was the only
// barrier, and it is per key, cached for ten seconds, counted on each node
// separately — and it switches off entirely when the database is unreachable
// (lib/quota.ts). So the ceiling disappeared exactly when the node was least
// able to cope. This one is in memory and does not depend on the database being
// well, which is the whole reason it exists.
configured("v1 has a ceiling that does not need the database", () => {
  reset();
  assert(V1_LIMITS.length > 0, "/v1/* has no per-address rate limit");
  const address = "203.0.113.30";
  for (let i = 0; i < V1_LIMITS[0].max; i++) checkAll(V1_LIMITS, address);
  assertEquals(checkAll(V1_LIMITS, address).allowed, false, "the ceiling holds");
  // Another caller is not touched by the first one running into it.
  assertEquals(checkAll(V1_LIMITS, "203.0.113.31").allowed, true);
  reset();
});

// One tenant's flood must not silence another tenant's clients.
//
// The v1 ceiling was first written against the bare address, which put every
// tenant's clients behind one carrier-grade NAT or one cloud egress into a
// single bucket — and let a stranger with no key at all spend 1200 an hour on
// somebody's outbound address and shut their API off. The rule client_ip.ts
// already states for the public routes applies here too, and `callerBucket`
// only inspects the shape of the key, so it stays before authentication.
configured("v1 counts the address and the key together, as the public routes do", () => {
  reset();
  const address = "203.0.113.33";
  const request = (key: string | null) =>
    new Request("https://relay.test/v1/pageview", {
      method: "POST",
      headers: { "x-forwarded-for": address, ...(key ? { "x-api-key": key } : {}) },
    });

  const noisy = callerBucket(request(KEY_A));
  for (let i = 0; i < V1_LIMITS[0].max; i++) checkAll(V1_LIMITS, noisy);
  assertEquals(checkAll(V1_LIMITS, noisy).allowed, false, "the noisy caller is stopped");

  // Same address, another tenant's key, and a keyless caller: untouched.
  assertEquals(checkAll(V1_LIMITS, callerBucket(request(KEY_B))).allowed, true);
  assertEquals(checkAll(V1_LIMITS, callerBucket(request(null))).allowed, true);
  reset();
});

// And the route actually consults it. The case above only proves the numbers
// exist; a limit nobody calls is a constant. This one goes through the router,
// with no key at all — the refusal must land before authentication, since the
// point is to refuse a flood without a key lookup each.
configured("the v1 route refuses a flooding address before it looks at the key", async () => {
  reset();
  const { match } = await import("../src/lib/router.ts");
  await import("../src/routes/v1.ts"); // registers the routes as a side effect
  const found = match("POST", "/v1/pageview");
  assert(found, "no route for POST /v1/pageview");

  const address = "203.0.113.32";
  const call = () =>
    found.h({
      req: new Request("https://relay.test/v1/pageview", {
        method: "POST",
        headers: { "x-forwarded-for": address },
      }),
      params: found.params,
      url: new URL("https://relay.test/v1/pageview"),
    });

  // No key, so every one of these is a 401 — and each still counts, which is
  // the behaviour wanted: unauthorized attempts are exactly what a flood is.
  const first = await call();
  assertEquals(first.status, 401, "a keyless call is unauthorized, not refused by the limiter yet");
  for (let i = 1; i < V1_LIMITS[0].max; i++) await call();
  const refused = await call();
  assertEquals(refused.status, 429, "past the ceiling the address is refused");
  assert(refused.headers.get("retry-after"), "and told when to come back");

  // And it is the caller's bucket the route spends, not the bare address: the
  // same address wearing another tenant's key still gets through. Without this
  // the route could quietly go back to counting addresses and every case above
  // would stay green.
  const withKey = async (key: string) =>
    (await found.h({
      req: new Request("https://relay.test/v1/pageview", {
        method: "POST",
        headers: { "x-forwarded-for": address, "x-api-key": key },
      }),
      params: found.params,
      url: new URL("https://relay.test/v1/pageview"),
    })).status;
  assertEquals(
    await withKey(KEY_A),
    401,
    "another tenant's caller on the same address is not refused by the limiter",
  );
  reset();
});
