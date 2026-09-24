// A business profile goes a year after its last offer (offers spec, retention;
// privacy policy §5; business.profile.retention; db/056).
//
// The account, its venues and their offers together: the spec keeps a venue
// for one reason only — not to post the envelope again — and a season without
// offers is what the year is for. The clock is the last offer's publication,
// or the account's creation if it never published. A venue suspended for
// systematic complaints leaves its address as an HMAC on the node's key and the
// date for one more year, so a year of waiting does not lift the suspension;
// "this is not us" leaves nothing. Without the key the suspended venue waits:
// deleting it bare would lift the suspension the year is there to hold.
import { config } from "../config.ts";
import { log } from "./log.ts";
import { transaction } from "./db.ts";

export const PROFILE_RETENTION_DAYS = 365; // business.profile.retention
export const SUSPENSION_KEPT_DAYS = 365;
const BATCH = 200;

const KEY_SALT = new TextEncoder().encode("xor.ad/venue-address/v1");
const KEY_INFO = new TextEncoder().encode("suspended venue address, HMAC-SHA256");
let cached: CryptoKey | null = null;

async function hmacKey(): Promise<CryptoKey | null> {
  if (cached) return cached;
  if (config.vaultShareKey.length === 0) return null;
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(config.vaultShareKey) as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: KEY_SALT as BufferSource, info: KEY_INFO as BufferSource }, material, 256);
  cached = await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return cached;
}

// The same street written twice is one address: case and runs of spaces do not
// make a new one.
export async function addressHmac(address: string): Promise<string | null> {
  const key = await hmacKey();
  if (!key) return null;
  const normal = address.trim().toLowerCase().replace(/\s+/g, " ");
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(normal) as BufferSource);
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sweepAdvertisers(): Promise<{ deleted: number; kept: number; held: number }> {
  return await transaction(async (run) => {
    await run(`DELETE FROM venue_suspensions WHERE keep_until < now()`);
    const due = await run<{ id: string }>(
      `SELECT a.id FROM advertisers a
        WHERE greatest(a.created_at, coalesce(
                (SELECT max(o.published_at) FROM offers o JOIN venues v ON v.id = o.venue_id
                  WHERE v.advertiser_id = a.id), a.created_at))
              < now() - make_interval(days => ${PROFILE_RETENTION_DAYS})
        ORDER BY a.created_at LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`,
    );
    let deleted = 0, kept = 0, held = 0;
    for (const { id } of due) {
      const suspended = await run<{ address: string; suspended_at: Date | null }>(
        `SELECT address, suspended_at FROM venues
          WHERE advertiser_id = $1 AND verification_status = 'suspended' AND suspended_reason = 'systematic'`,
        [id],
      );
      const hashes: { hmac: string; at: Date }[] = [];
      let keyMissing = false;
      for (const venue of suspended) {
        const hmac = await addressHmac(venue.address);
        if (!hmac) keyMissing = true;
        else hashes.push({ hmac, at: venue.suspended_at ?? new Date() });
      }
      if (keyMissing) {
        held++;
        continue;
      }
      for (const { hmac, at } of hashes) {
        await run(
          `INSERT INTO venue_suspensions (address_hmac, suspended_at, keep_until)
           VALUES ($1, $2, now() + make_interval(days => ${SUSPENSION_KEPT_DAYS}))
           ON CONFLICT (address_hmac) DO UPDATE SET suspended_at = EXCLUDED.suspended_at, keep_until = EXCLUDED.keep_until`,
          [hmac, at],
        );
        kept++;
      }
      await run(
        `UPDATE offers SET repeated_from_offer_id = NULL
          WHERE repeated_from_offer_id IN (SELECT o.id FROM offers o JOIN venues v ON v.id = o.venue_id WHERE v.advertiser_id = $1)`,
        [id],
      );
      await run(`DELETE FROM offers WHERE venue_id IN (SELECT id FROM venues WHERE advertiser_id = $1)`, [id]);
      await run(`DELETE FROM venues WHERE advertiser_id = $1`, [id]);
      await run(`DELETE FROM advertisers WHERE id = $1`, [id]);
      deleted++;
    }
    if (held > 0) log("error", "suspended venues wait for VAULT_SHARE_KEY before they can go", { held });
    return { deleted, kept, held };
  });
}
