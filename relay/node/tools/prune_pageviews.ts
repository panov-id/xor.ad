// Drop page views older than a cutoff, per tenant.
//
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     tools/prune_pageviews.ts [--days=90] [--apply] [--brand=<key>]
//
// Without --apply it only reports. The counter writes one object per view, so
// the collection grows with traffic and nothing else shrinks it; until state
// moves somewhere with aggregates (docs/api-platform_*, open question 1), the
// answer is a retention window.
//
// Age comes from the listing metadata, never from reading the objects: a prune
// that had to read what it deletes would cost as much as the traffic it cleans
// up after.

import { config } from "../src/config.ts";
import { storageEnabled, type StorageEntry } from "../src/lib/storage.ts";
import { scopedForBrand } from "../src/lib/scoped_storage.ts";
import { allBrands } from "../src/lib/brand_registry.ts";

// A window this short is far more likely to be a typo than an intention, and the
// deletion is not reversible.
const MINIMUM_DAYS = 7;
const DEFAULT_DAYS = 90;

// Pure, so the boundary condition is testable without a transport.
export function expiredEntries(
  entries: readonly StorageEntry[],
  cutoffIso: string,
): StorageEntry[] {
  // An entry the transport could not date is left alone: "unknown age" is not
  // "old", and guessing wrong here deletes data.
  return entries.filter((entry) => entry.createdAt && entry.createdAt < cutoffIso);
}

if (import.meta.main) {
  const apply = Deno.args.includes("--apply");
  const daysArgument = Deno.args.find((argument) => argument.startsWith("--days="));
  const brandArgument = Deno.args.find((argument) => argument.startsWith("--brand="));
  const days = daysArgument ? Number(daysArgument.split("=")[1]) : DEFAULT_DAYS;
  const onlyBrand = brandArgument?.split("=")[1];

  if (!Number.isFinite(days) || days < MINIMUM_DAYS) {
    console.error(`--days must be a number of at least ${MINIMUM_DAYS} (got "${days}")`);
    Deno.exit(1);
  }
  if (!storageEnabled()) {
    console.error("storage is not configured — nothing to prune");
    Deno.exit(1);
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  console.log(`env ${config.envName} · keeping views newer than ${cutoff} (${days} days)`);

  // The platform's own scope holds anything written before the tenancy
  // migration; a tenant's holds everything since.
  const brands = (await allBrands()).map((brand) => brand.key);
  const scopes = onlyBrand ? [onlyBrand] : [null, ...brands];

  let removed = 0;
  let kept = 0;
  for (const brand of scopes) {
    const store = scopedForBrand(brand);
    const directory = `pageviews/${config.envName}`;
    const entries = await store.listDetailed(directory);
    const expired = expiredEntries(entries, cutoff);
    kept += entries.length - expired.length;

    const label = brand ?? "platform";
    console.log(`\n== ${label} — ${entries.length} object(s), ${expired.length} past the cutoff`);
    if (expired.length === 0) continue;

    if (!apply) {
      console.log(`   would delete ${expired.length} (oldest ${expired[expired.length - 1]?.createdAt})`);
      continue;
    }
    for (const entry of expired) {
      await store.del(`${directory}/${entry.name}`);
      removed += 1;
    }
    console.log(`   deleted ${expired.length}`);
  }

  console.log(`\n== summary (${apply ? "applied" : "plan only"})`);
  console.log(`   kept ${kept} · ${apply ? `deleted ${removed}` : "nothing was deleted"}`);
  if (!apply) console.log("\nre-run with --apply to delete");
}
