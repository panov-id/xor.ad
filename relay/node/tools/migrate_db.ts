// Apply the SQL migrations in db/, in name order, once each.
//
//   deno run --allow-env --allow-net --allow-read tools/migrate_db.ts [--dry-run]
//
// Deliberately dumb: no rollback, no checksums, no DSL. A migration is a file,
// applying it is recorded by name, and a file already recorded is skipped. What
// this buys is that reading db/ tells you the schema, and reading
// schema_migrations tells you what a database actually has.

import { queryOrThrow, transaction } from "../src/lib/db.ts";

// One migrator at a time per database. The wizard runs this per environment and
// the pool has more than one box; two runs used to see the same empty `applied`
// set and both apply the same ALTER, colliding on a deadlock or on the primary
// key of schema_migrations — a deploy failing in the middle of the schema. The
// number is arbitrary and only has to be the same everywhere.
const MIGRATION_LOCK = 8_150_413;

const dryRun = Deno.args.includes("--dry-run");
const directory = new URL("../db/", import.meta.url);

const files = [...Deno.readDirSync(directory)]
  .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

await queryOrThrow(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await queryOrThrow<{ name: string }>("SELECT name FROM schema_migrations")).map((row) => row.name),
);

let ran = 0;
for (const name of files) {
  if (applied.has(name)) {
    console.log(`   skip  ${name} (applied)`);
    continue;
  }
  if (dryRun) {
    console.log(`   would apply ${name}`);
    continue;
  }
  const sql = await Deno.readTextFile(new URL(name, directory));
  // The file and the record of it go in ONE transaction. They used to be two
  // calls — two connections from the pool, two transactions — and the gap
  // between them is a migration that ran and was not written down: the next run
  // applies it again. Every file so far survives that by hand-written
  // `IF NOT EXISTS`, and nothing required them to; the first `INSERT` or
  // `UPDATE ... SET x = x + 1` in a migration would have been applied twice
  // without a word.
  const applied_now = await transaction(async (tx) => {
    // The lock is taken inside the transaction and released with it —
    // `pg_advisory_lock` on a pooled connection would outlive the work and be
    // released by whoever got that connection next, which is worse than no lock.
    // A second migrator waits here, then finds the row already written.
    await tx("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    const already = await tx<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    // Re-read under the lock. The list was taken before it, so two migrators
    // starting together both saw this file as pending; only one may apply it.
    if (already.length > 0) return false;
    await tx(sql);
    await tx("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    return true;
  });
  if (!applied_now) {
    console.log(`   skip  ${name} (applied by another run)`);
    continue;
  }
  console.log(`   applied ${name}`);
  ran += 1;
}

console.log(`\n${files.length} migration(s) on disk, ${applied.size} already applied, ${ran} run now`);
