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
  reset,
  WAITLIST_LIMITS,
} from "../src/lib/rate_limit.ts";
import { callerBucket } from "../src/lib/client_ip.ts";
import { EVENTS, PAGEVIEWS } from "../src/lib/quota.ts";
import { QUOTA_COLUMNS } from "../src/lib/api_key.ts";

const request = (address: string, key: string | null) =>
  new Request("https://relay.test/pageview", {
    method: "POST",
    headers: {
      "x-forwarded-for": address,
      ...(key ? { "x-api-key": key } : {}),
    },
  });

Deno.test("the two silent routes have a limit at all", () => {
  // They had none. Everything else here depends on that not being true again.
  assert(PAGEVIEW_LIMITS.length > 0, "/pageview has no rate limit");
  assert(CLIENT_ERROR_LIMITS.length > 0, "/client-error has no rate limit");
  for (const limits of [PAGEVIEW_LIMITS, CLIENT_ERROR_LIMITS]) {
    assert(limits.every((limit) => limit.max > 0 && limit.windowMs > 0));
  }
});

Deno.test("the bucket is the address and the key together", () => {
  const address = "203.0.113.7";
  assert(callerBucket(request(address, "ak_pub_aaa")) !== callerBucket(request(address, "ak_pub_bbb")));
  assertEquals(callerBucket(request(address, "ak_pub_aaa")), callerBucket(request(address, "ak_pub_aaa")));
  // A caller naming nobody shares one bucket, which is the right answer for
  // traffic that named nobody.
  assertEquals(callerBucket(request(address, null)), `${address}|keyless`);
});

Deno.test("one tenant's noisy visitor does not silence that address for another", () => {
  reset();
  const address = "203.0.113.8";
  const hourly = PAGEVIEW_LIMITS[0].max;
  const noisy = callerBucket(request(address, "ak_pub_loud"));
  for (let i = 0; i < hourly; i++) checkAll(PAGEVIEW_LIMITS, noisy);
  assertEquals(checkAll(PAGEVIEW_LIMITS, noisy).allowed, false);

  // Same address, another tenant's key: untouched.
  const other = callerBucket(request(address, "ak_pub_quiet"));
  assertEquals(checkAll(PAGEVIEW_LIMITS, other).allowed, true);
});

Deno.test("running out of page views leaves the sign-up form alone", () => {
  reset();
  const bucket = callerBucket(request("203.0.113.9", "ak_pub_x"));
  for (let i = 0; i < PAGEVIEW_LIMITS[0].max; i++) checkAll(PAGEVIEW_LIMITS, bucket);
  assertEquals(checkAll(PAGEVIEW_LIMITS, bucket).allowed, false);
  // The waitlist counts in its own windows, under its own names.
  assertEquals(checkAll(WAITLIST_LIMITS, bucket).allowed, true);
});

Deno.test("the two families count in different cells and against different columns", () => {
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
