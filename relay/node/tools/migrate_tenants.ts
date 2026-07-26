// Move pre-tenancy objects into their tenant's prefix.
//
//   deno run --allow-env --allow-read --allow-write tools/migrate_tenants.ts \
//     [--apply] [--delete] [--default-brand=<key>]
//
// Three passes on purpose, each safe to repeat:
//   (no flags)  plan only — says what would move where, touches nothing
//   --apply     copies into tenants/<brand>/…, leaves the originals alone
//   --delete    removes an original only after verifying its copy is readable
//
// So the rollback for --apply is "do nothing" (the node reads both spaces), and
// --delete is a separate decision made after the panel looks right.

import { config } from "../src/config.ts";
import { del, get, list, storageEnabled } from "../src/lib/storage.ts";
import { scopedForBrand } from "../src/lib/scoped_storage.ts";
import { resolveBrand } from "../src/lib/welcome.ts";

const apply = Deno.args.includes("--apply");
const remove = Deno.args.includes("--delete");
const defaultBrand =
  Deno.args.find((argument) => argument.startsWith("--default-brand="))?.split("=")[1] ??
    config.brands[0]?.key;

type StoredRecord = Record<string, unknown>;

// How each collection names its tenant. waitlist records carry the brand
// already; client errors never did, so they are placed the way the node placed
// them at the time — by the signup source.
const COLLECTIONS: Array<{ dir: string; brandOf: (record: StoredRecord) => string }> = [
  {
    dir: `waitlist/${config.envName}`,
    brandOf: (record) => typeof record.brand === "string" ? record.brand : defaultBrand,
  },
  {
    dir: `client-errors/${config.envName}`,
    brandOf: (record) =>
      typeof record.brand === "string"
        ? record.brand
        : resolveBrand(typeof record.source === "string" ? record.source : null).key,
  },
];

if (!storageEnabled()) {
  console.error("storage is not configured — nothing to migrate");
  Deno.exit(1);
}
if (!defaultBrand) {
  console.error("no brands configured — pass --default-brand=<key>");
  Deno.exit(1);
}

const tally: Record<string, { moved: number; skipped: number; deleted: number; failed: number }> =
  {};
const count = (brand: string) => (tally[brand] ??= { moved: 0, skipped: 0, deleted: 0, failed: 0 });

for (const collection of COLLECTIONS) {
  const files = await list(collection.dir);
  console.log(`\n== ${collection.dir} — ${files.length} object(s)`);

  for (const file of files) {
    const from = `${collection.dir}/${file}`;
    const record = await get<StoredRecord>(from);
    if (!record) {
      console.warn(`   ! unreadable, left in place: ${from}`);
      count(defaultBrand).failed += 1;
      continue;
    }

    const brand = collection.brandOf(record);
    const store = scopedForBrand(brand);
    const already = await store.exists(from);

    if (!already) {
      if (!apply) {
        console.log(`   would move -> tenants/${brand}/${from}`);
        count(brand).moved += 1;
        continue;
      }
      await store.put(from, record);
      count(brand).moved += 1;
    } else {
      count(brand).skipped += 1;
    }

    if (remove) {
      // Verified, not assumed: the copy is read back before the original goes.
      if (await store.exists(from)) {
        await del(from);
        count(brand).deleted += 1;
      } else {
        console.warn(`   ! copy missing, original kept: ${from}`);
        count(brand).failed += 1;
      }
    }
  }
}

// --delete is a write of its own: it runs without --apply (that is the third
// pass, made after the panel looks right), so "plan only" is true of neither
// pass that carries it. Saying otherwise in the very run that removed the
// originals is the worst place to be imprecise.
const pass = remove ? (apply ? "applied, deleting" : "deleting") : apply ? "applied" : "plan only";
console.log(`\n== summary (${pass})`);
for (const [brand, numbers] of Object.entries(tally)) {
  console.log(
    `   ${brand}: moved=${numbers.moved} already=${numbers.skipped} ` +
      `deleted=${numbers.deleted} failed=${numbers.failed}`,
  );
}
if (!apply && !remove) console.log("\nnothing was written — re-run with --apply");
if (!apply && remove) {
  console.log("\ncopies were not made in this run; originals with a copy were removed");
}
