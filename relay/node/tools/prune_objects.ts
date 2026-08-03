// Drop stored objects past the window their collection is allowed to keep them.
//
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     tools/prune_objects.ts [--apply] [--brand=<key>] [--only=<collection>]
//
// Without --apply it only reports.
//
// The privacy policy of both storefronts names a retention period for every
// collection here. Until this existed, one of them was true: page views were
// pruned and nothing else was, so the document promised windows the system did
// not keep. A duration with no job behind it is not a duration.
//
// Page views keep their own tool: their window is a judgement about how long the
// detail is worth reading, and it is argued there. Everything else is here.
//
// Age comes from the listing metadata, never from reading the objects — a prune
// that had to read what it deletes would cost as much as what wrote it.

import { config } from "../src/config.ts";
import { storageEnabled } from "../src/lib/storage.ts";
import { scopedForBrand } from "../src/lib/scoped_storage.ts";
import { allBrands } from "../src/lib/brand_registry.ts";
import { expiredEntries } from "./prune_pageviews.ts";

export interface Collection {
  /** The prefix under the environment, as the writer spells it. */
  readonly directory: string;
  /** Days to keep, or null when the window is not a fixed age. */
  readonly days: number | null;
  /** Why this number, in the words the policy uses. */
  readonly because: string;
}

// One row per promise made in `landing/legal/privacy_EN.md`.
export const COLLECTIONS: readonly Collection[] = [
  {
    directory: "audit",
    days: 365,
    because: "who changed what in the panel — a year, which is also our own protection",
  },
  {
    directory: "server-logs",
    days: 30,
    because: "incident review; long enough to explain a breakage, short enough not to become an archive",
  },
  {
    directory: "client-errors",
    days: 30,
    because: "a crash report is worth reading while the release that caused it is still live",
  },
  {
    directory: "client-errors-unattributed",
    days: 30,
    because: "same window as the attributed ones — a report with no tenant is still a crash",
  },
  {
    directory: "waitlist",
    // Not an age. The promise is "until launch and a year after", and before
    // launch nothing has expired — deleting leads on a timer would quietly throw
    // away the only thing this collection is for. The number arrives with the
    // launch date, through WAITLIST_RETENTION_DAYS.
    days: null,
    because: "until launch and a year after — set WAITLIST_RETENTION_DAYS when the date is known",
  },
];

const A_DAY_MS = 24 * 60 * 60 * 1000;
// A window this short is far more likely to be a typo than an intention, and the
// deletion is not reversible.
const MINIMUM_DAYS = 7;

export interface PruneObjectsResult {
  removed: number;
  kept: number;
  skipped: string[];
}

function windowFor(collection: Collection): number | null {
  if (collection.directory !== "waitlist") return collection.days;
  const raw = Deno.env.get("WAITLIST_RETENTION_DAYS");
  if (!raw) return null;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < MINIMUM_DAYS) {
    throw new Error(`WAITLIST_RETENTION_DAYS must be at least ${MINIMUM_DAYS} (got "${raw}")`);
  }
  return days;
}

export async function pruneObjects(
  options: {
    apply?: boolean;
    onlyBrand?: string;
    only?: string;
    report?: (line: string) => void;
  } = {},
): Promise<PruneObjectsResult> {
  const apply = options.apply ?? false;
  const say = options.report ?? (() => {});
  if (!storageEnabled()) throw new Error("storage is not configured — nothing to prune");

  const brands = (await allBrands()).map((brand) => brand.key);
  // The platform's own scope holds anything written before the tenancy
  // migration; a tenant's holds everything since.
  const scopes = options.onlyBrand ? [options.onlyBrand] : [null, ...brands];

  let removed = 0;
  let kept = 0;
  const skipped: string[] = [];

  for (const collection of COLLECTIONS) {
    if (options.only && options.only !== collection.directory) continue;
    const days = windowFor(collection);
    if (days === null) {
      skipped.push(collection.directory);
      say(`\n== ${collection.directory} — no window set: ${collection.because}`);
      continue;
    }
    const cutoff = new Date(Date.now() - days * A_DAY_MS).toISOString();
    say(`\n== ${collection.directory} — keeping newer than ${cutoff} (${days} days)`);
    say(`   ${collection.because}`);

    for (const brand of scopes) {
      const store = scopedForBrand(brand);
      const directory = `${collection.directory}/${config.envName}`;
      const entries = await store.listDetailed(directory);
      const expired = expiredEntries(entries, cutoff);
      kept += entries.length - expired.length;
      if (expired.length === 0) continue;

      const label = brand ?? "platform";
      if (!apply) {
        say(`   ${label}: would delete ${expired.length} of ${entries.length}`);
        continue;
      }
      for (const entry of expired) {
        await store.del(`${directory}/${entry.name}`);
        removed += 1;
      }
      say(`   ${label}: deleted ${expired.length} of ${entries.length}`);
    }
  }

  say(`\n== summary (${apply ? "applied" : "plan only"})`);
  say(`   kept ${kept} · ${apply ? `deleted ${removed}` : "nothing was deleted"}`);
  if (skipped.length) say(`   no window set for: ${skipped.join(", ")}`);
  return { removed, kept, skipped };
}

if (import.meta.main) {
  const args = Deno.args;
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const result = await pruneObjects({
    apply: args.includes("--apply"),
    onlyBrand: flag("brand"),
    only: flag("only"),
    report: (line) => console.log(line),
  });
  if (!args.includes("--apply") && result.kept === 0 && result.removed === 0) {
    console.log("   nothing stored yet");
  }
}
