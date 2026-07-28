// Apply the SQL migrations in db/, in name order, once each.
//
//   deno run --allow-env --allow-net --allow-read tools/migrate_db.ts [--dry-run]
//
// Deliberately dumb: no rollback, no checksums, no DSL. A migration is a file,
// applying it is recorded by name, and a file already recorded is skipped. What
// this buys is that reading db/ tells you the schema, and reading
// schema_migrations tells you what a database actually has.

import { queryOrThrow } from "../src/lib/db.ts";

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
  // One statement per migration file would be cleaner in theory and unbearable
  // in practice; Postgres runs a multi-statement string in one implicit
  // transaction, which is the atomicity that matters here.
  await queryOrThrow(sql);
  await queryOrThrow("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
  console.log(`   applied ${name}`);
  ran += 1;
}

console.log(`\n${files.length} migration(s) on disk, ${applied.size} already applied, ${ran} run now`);
