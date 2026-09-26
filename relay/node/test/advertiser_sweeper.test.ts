// The business-profile sweeper when the node has no VAULT_SHARE_KEY (B15,
// 2026-09-26). A venue suspended for systematic complaints may go only as an
// HMAC of its address on the node's key, kept a year so waiting does not lift
// the suspension; without the key there is nothing to keep it by, so the
// profile waits (advertiser_sweeper.ts, keyMissing). identity_routes.test.ts
// sweeps with the key; this is the branch without it, and then the same
// profile once the key is there.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.delete("VAULT_SHARE_KEY");

const { queryOrThrow } = await import("../src/lib/db.ts");
const { reloadConfig } = await import("../src/config.ts");
const { addressHmac, sweepAdvertisers } = await import("../src/lib/advertiser_sweeper.ts");

const pool = { sanitizeOps: false, sanitizeResources: false };
const count = async (sql: string, args: unknown[]) => (await queryOrThrow<{ n: number }>(sql, args))[0].n;

Deno.test({ name: "a suspended profile past its year waits for the key, then goes and leaves its address's hash", ...pool, async fn() {
  const advertiser = crypto.randomUUID();
  const venue = crypto.randomUUID();
  const address = `Систематическая ${crypto.randomUUID().slice(0, 8)}`;
  // A year and more since it was made, and no offer ever: due by its creation.
  await queryOrThrow(
    `INSERT INTO advertisers (id, email, contact, created_at) VALUES ($1, 'held@alpha.test', 'Держим', now() - interval '400 days')`,
    [advertiser]);
  await queryOrThrow(
    `INSERT INTO venues (id, advertiser_id, name, address, verification_status, suspended_at, suspended_reason, created_at)
     VALUES ($1, $2, 'Место', $3, 'suspended', now() - interval '30 days', 'systematic', now() - interval '400 days')`,
    [venue, advertiser, address]);

  // No key: the profile stays, counted as held, and no hash is written.
  assertEquals(await addressHmac(address), null, "the node has a key where this test took it away");
  const without = await sweepAdvertisers();
  assertEquals(without.held, 1, `the profile without a key was not held: ${JSON.stringify(without)}`);
  assertEquals(await count(`SELECT count(*)::int AS n FROM advertisers WHERE id = $1`, [advertiser]), 1,
    "the suspended profile was deleted without its address's hash — waiting a year now lifts the suspension");
  assertEquals(await count(`SELECT count(*)::int AS n FROM venues WHERE id = $1`, [venue]), 1, "the suspended venue went without the key");

  // The key arrives: the same profile goes, and its address stays as a keyed hash for a year.
  Deno.env.set("VAULT_SHARE_KEY", "advertiser-sweeper-key");
  reloadConfig();
  const hmac = await addressHmac(address);
  assert(hmac, "no hash with the key set");
  const withKey = await sweepAdvertisers();
  assertEquals(withKey.held, 0, `held with the key: ${JSON.stringify(withKey)}`);
  assertEquals(await count(`SELECT count(*)::int AS n FROM advertisers WHERE id = $1`, [advertiser]), 0, "the profile stayed once the key was there");
  assertEquals(await count(
    `SELECT count(*)::int AS n FROM venue_suspensions WHERE address_hmac = $1 AND keep_until > now() + interval '360 days'`, [hmac]), 1,
    "the profile went and left no hash of its address kept a year");
}});
