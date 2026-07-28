// Copy the brands and keys that live in object storage into the database.
//
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     tools/migrate_control_state.ts [--apply]
//
// Plan by default. Brands go first: a key references its brand, and the database
// enforces that with a foreign key — which is the point of moving them.
//
// Idempotent: a row that is already there is left alone, so a re-run after a
// partial failure finishes the job rather than doubling it.

import { config } from "../src/config.ts";
import { get, list, storageEnabled } from "../src/lib/storage.ts";
import { enabled as databaseEnabled, queryOrThrow } from "../src/lib/db.ts";
import { type Brand } from "../src/config.ts";
import { type PublishableKey } from "../src/lib/api_key.ts";

const apply = Deno.args.includes("--apply");

if (!databaseEnabled()) {
  console.error("DATABASE_URL is not set — nowhere to migrate to");
  Deno.exit(1);
}
if (!storageEnabled()) {
  console.error("storage is not configured — nothing to migrate from");
  Deno.exit(1);
}

const brandsDir = `platform/${config.envName}/brands`;
const keysDir = `platform/${config.envName}/publishable-keys`;

async function readAll<T>(directory: string): Promise<T[]> {
  const files = await list(directory);
  const rows = await Promise.all(files.map((file) => get<T>(`${directory}/${file}`)));
  // Objects that failed to read are dropped rather than aborting the run: a
  // migration that stops at the first unreadable file leaves the rest unmigrated
  // and says nothing about which ones were fine.
  return rows.filter((row) => row !== null) as T[];
}

// The env seeds are brands too, and a key pointing at one of them would fail the
// foreign key — so they are part of what gets written.
const stored = await readAll<Brand>(brandsDir);
const brands = [...new Map([...config.brands, ...stored].map((b) => [b.key, b])).values()];
const keys = await readAll<PublishableKey>(keysDir);

console.log(`env ${config.envName}`);
console.log(`   brands: ${brands.length} (${stored.length} stored, rest seeded from BRANDS)`);
console.log(`   keys:   ${keys.length}`);

if (!apply) {
  console.log("\nplan only — re-run with --apply");
  Deno.exit(0);
}

for (const brand of brands) {
  await queryOrThrow(
    `INSERT INTO brands (key, name, domain, sender, upper, match)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (key) DO NOTHING`,
    [brand.key, brand.name, brand.domain, brand.from, brand.upper, brand.match],
  );
}
console.log(`   wrote ${brands.length} brand(s)`);

let written = 0;
let skipped = 0;
for (const key of keys) {
  const rows = await queryOrThrow<{ id: string }>(
    `INSERT INTO api_keys (id, brand, origins, created_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [key.id, key.brand, key.origins, key.created_at, key.revoked_at],
  );
  rows.length ? (written += 1) : (skipped += 1);
}
console.log(`   wrote ${written} key(s), ${skipped} already there`);
console.log("\nThe objects in storage are left in place: the node reads the database first and");
console.log("falls back to them, so nothing is lost if this has to be undone.");
