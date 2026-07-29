// Drop page views older than a cutoff, per tenant.
//
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     tools/prune_pageviews.ts [--days=14] [--apply] [--brand=<key>]
//
// Without --apply it only reports. The counter writes one object per view, so
// the collection grows with traffic and nothing else shrinks it.
//
// The count itself no longer depends on these objects: it lives in
// `pageview_daily`, a row per brand/day/path/lang, and outlives any prune. What
// an object still carries is what the aggregate deliberately does not — the
// referrer, the viewport and the time of day — so the window is now the length
// of time that detail is worth reading, not the length of time the numbers must
// survive. Hence a fortnight rather than a quarter.
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
const DEFAULT_DAYS = 14;

// Pure, so the boundary condition is testable without a transport.
export function expiredEntries(
  entries: readonly StorageEntry[],
  cutoffIso: string,
): StorageEntry[] {
  // An entry the transport could not date is left alone: "unknown age" is not
  // "old", and guessing wrong here deletes data.
  return entries.filter((entry) => entry.createdAt && entry.createdAt < cutoffIso);
}

export interface PruneResult {
  removed: number;
  kept: number;
  expired: number;
}

// The prune itself, so the scheduled job and the command line do the same thing
// rather than two things that agree for now. `report` is where the command line
// puts its narration; the job passes nothing and reads the result.
export async function prunePageviews(
  options: { days?: number; apply?: boolean; onlyBrand?: string; report?: (line: string) => void },
): Promise<PruneResult> {
  const days = options.days ?? DEFAULT_DAYS;
  const apply = options.apply ?? false;
  const say = options.report ?? (() => {});

  if (!Number.isFinite(days) || days < MINIMUM_DAYS) {
    throw new Error(`days must be a number of at least ${MINIMUM_DAYS} (got "${days}")`);
  }
  if (!storageEnabled()) throw new Error("storage is not configured — nothing to prune");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  say(`env ${config.envName} · keeping views newer than ${cutoff} (${days} days)`);

  // The platform's own scope holds anything written before the tenancy
  // migration; a tenant's holds everything since.
  const brands = (await allBrands()).map((brand) => brand.key);
  const scopes = options.onlyBrand ? [options.onlyBrand] : [null, ...brands];

  let removed = 0;
  let kept = 0;
  let expiredTotal = 0;
  for (const brand of scopes) {
    const store = scopedForBrand(brand);
    const directory = `pageviews/${config.envName}`;
    const entries = await store.listDetailed(directory);
    const expired = expiredEntries(entries, cutoff);
    kept += entries.length - expired.length;
    expiredTotal += expired.length;

    const label = brand ?? "platform";
    say(`\n== ${label} — ${entries.length} object(s), ${expired.length} past the cutoff`);
    if (expired.length === 0) continue;

    if (!apply) {
      say(`   would delete ${expired.length} (oldest ${expired[expired.length - 1]?.createdAt})`);
      continue;
    }
    for (const entry of expired) {
      await store.del(`${directory}/${entry.name}`);
      removed += 1;
    }
    say(`   deleted ${expired.length}`);
  }

  say(`\n== summary (${apply ? "applied" : "plan only"})`);
  say(`   kept ${kept} · ${apply ? `deleted ${removed}` : "nothing was deleted"}`);
  return { removed, kept, expired: expiredTotal };
}

if (import.meta.main) {
  const apply = Deno.args.includes("--apply");
  const daysArgument = Deno.args.find((argument) => argument.startsWith("--days="));
  const brandArgument = Deno.args.find((argument) => argument.startsWith("--brand="));

  try {
    await prunePageviews({
      days: daysArgument ? Number(daysArgument.split("=")[1]) : undefined,
      apply,
      onlyBrand: brandArgument?.split("=")[1],
      report: (line) => console.log(line),
    });
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    Deno.exit(1);
  }
  if (!apply) console.log("\nre-run with --apply to delete");
}
