// The address limits outlive the process (lib/rate_limit.ts, db/074): a limit
// spent by one node is still spent for a node started afresh on the same
// database, with the same buckets — an IPv6 host by its /64, an IPv4 host
// however it is spelled — while a limit by identity starts from nought, as
// protocol §5 keeps it.
//
// "Afresh" is a second copy of the module, imported under another URL: its own
// empty map, exactly what a new container begins with.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
Deno.env.set("NODE_ENV_NAME", "test");

const database = await import("../src/lib/db.ts");
const first = await import("../src/lib/rate_limit.ts");
const pooled = { sanitizeOps: false, sanitizeResources: false };

const fresh = async () => await import(`../src/lib/rate_limit.ts?node=${crypto.randomUUID()}`) as typeof first;

Deno.test({ name: "a spent address limit is still spent on a node started afresh; an identity's is not", ...pooled, fn: async () => {
  await database.queryOrThrow(`DELETE FROM rate_limit_hits`);
  first.reset();
  // The first node starts as main.ts starts one: reading back, then writing.
  await first.loadRateLimits();
  const limits = first.SIGN_IN_LIMITS; // 20 an hour, 60 a day, by address
  const host = "2001:db8:7:1::10";
  for (let i = 0; i < 20; i++) assert(first.checkAll(limits, host).allowed, `hit ${i + 1} refused`);
  assertEquals(first.checkAll(limits, host).allowed, false, "the twenty-first is refused on this node");
  // An identity's limit, spent too — it is not written.
  const identity = crypto.randomUUID();
  for (let i = 0; i < first.LIKE_LIMITS[0].max; i++) first.checkAll(first.LIKE_LIMITS, identity);
  assertEquals(first.checkAll(first.LIKE_LIMITS, identity).allowed, false);
  await first.hitsWritten();

  const next = await fresh();
  assert(next !== first, "the second copy is a module of its own");
  const read = await next.loadRateLimits();
  assert(read >= 20, `read back ${read} hits`);
  const again = next.checkAll(limits, host);
  assertEquals(again.allowed, false, "a node started afresh let the spent address in again");
  assert(again.retryAfterSeconds > 0 && again.retryAfterSeconds <= 3600, `Retry-After ${again.retryAfterSeconds}`);
  // The same /64 is the same bucket after a start, as before it.
  assertEquals(next.checkAll(limits, "2001:db8:7:1:ffff::1").allowed, false, "another address of the /64 got a fresh allowance");
  assertEquals(next.checkAll(limits, "2001:db8:7:2::10").allowed, true, "the next /64 is a bucket of its own");
  assertEquals(next.checkAll(first.LIKE_LIMITS, identity).allowed, true, "an identity's limit was written, protocol §5 keeps it in memory");
  await next.hitsWritten();
} });

Deno.test({ name: "an IPv4 host keeps its bucket across a start whichever way it is spelled", ...pooled, fn: async () => {
  await database.queryOrThrow(`DELETE FROM rate_limit_hits`);
  first.reset();
  await first.loadRateLimits();
  for (let i = 0; i < 20; i++) first.checkAll(first.SIGN_IN_LIMITS, "198.51.100.7");
  await first.hitsWritten();
  const next = await fresh();
  await next.loadRateLimits();
  for (const spelling of ["198.51.100.7", "::ffff:198.51.100.7", "64:ff9b::c633:6407", "198.051.100.007"]) {
    assertEquals(next.checkAll(next.SIGN_IN_LIMITS, spelling).allowed, false, `${spelling} got a fresh allowance after a start`);
  }
} });

// FX2 (X2): a key id is the caller's choice, checked for shape only, so a
// bucket named by one is never written — a made-up id per request would grow
// the table without bound. The fixed suffixes are the address and are written.
Deno.test({ name: "made-up key ids do not grow the table; a keyless address still does", ...pooled, fn: async () => {
  await database.queryOrThrow(`DELETE FROM rate_limit_hits`);
  first.reset();
  await first.loadRateLimits();
  const ip = "198.51.100.66";
  for (let i = 0; i < 300; i++) {
    const id = `ak_pub_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    first.checkAll(first.PAGEVIEW_LIMITS, `${ip}|${id}`);
    first.checkAll(first.V1_LIMITS, `${ip}|ak_live_${id.slice(7)}`);
  }
  first.checkAll(first.PAGEVIEW_LIMITS, `${ip}|keyless`);
  await first.hitsWritten();
  const rows = await database.queryOrThrow<{ bucket: string }>(`SELECT bucket FROM rate_limit_hits WHERE bucket LIKE $1`, [`%${ip}%`]);
  assertEquals(rows.filter((r) => r.bucket.includes("|ak_")).length, 0, `made-up key ids wrote ${rows.length} rows`);
  assert(rows.some((r) => r.bucket.endsWith(`${ip}|keyless`)), "the keyless bucket of an address was not written");
} });

Deno.test({ name: "the sweep takes the rows past every window and leaves the rest", ...pooled, fn: async () => {
  await database.queryOrThrow(`DELETE FROM rate_limit_hits`);
  await database.queryOrThrow(
    `INSERT INTO rate_limit_hits (bucket, at) VALUES ('sign-in:203.0.113.1', now() - interval '26 hours'),
                                                    ('sign-in:203.0.113.1', now() - interval '1 hour')`,
  );
  assertEquals(await first.sweepRateLimitHits(), 1);
  assertEquals((await database.queryOrThrow(`SELECT 1 FROM rate_limit_hits`)).length, 1);
} });

// The price, measured rather than guessed: the same checks on address keys
// (each hit also written) and on identity keys (not written). Printed for the
// hand-over; no threshold — the machine is shared.
Deno.test({ name: "the price of writing a hit: a request's check against the same check unwritten", ...pooled, fn: async () => {
  first.reset();
  await first.loadRateLimits();
  const N = 2000;
  const time = (key: (i: number) => string) => {
    const started = performance.now();
    for (let i = 0; i < N; i++) first.checkAll(first.SIGN_IN_LIMITS, key(i));
    return (performance.now() - started) / N;
  };
  const unwritten = time(() => crypto.randomUUID());
  const written = time((i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`);
  const started = performance.now();
  await first.hitsWritten();
  const drain = performance.now() - started;
  console.log(`RL1 price: check ${unwritten.toFixed(4)} ms unwritten, ${written.toFixed(4)} ms written (per request); ${N} writes landed ${drain.toFixed(0)} ms after`);
} });
