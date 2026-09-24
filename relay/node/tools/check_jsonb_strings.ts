// After the database suites: no jsonb column holds a JSON string of a value.
//
//   deno run --allow-env --allow-net --allow-read tools/check_jsonb_strings.ts
//
// postgres.js encodes a string handed to a jsonb parameter as JSON a second
// time, and the row holds "{\"a\":1}" instead of {"a":1}. It reached
// production twice (the Article 16 snapshot, /v1's idempotency answer) and
// hid twice more; a scan of the SQL text for `$n::jsonb` missed the snapshot,
// whose parameter had no cast at all (loop, 2026-09-24). So the check asks the
// data, not the code: every jsonb column the schema has, after every writer the
// suites exercise has written. None of them holds a string on purpose; a column
// that ever should is named in ALLOWED with its reason.
//
// Exit 0 clean · 1 a column holds strings (named, with a count).

if (!Deno.env.get("RELAY_DB_TIMEOUT_MS")) Deno.env.set("RELAY_DB_TIMEOUT_MS", "60000");
import { closePool, queryOrThrow } from "../src/lib/db.ts";

const ALLOWED = new Set<string>([]);

const columns = await queryOrThrow<{ table_name: string; column_name: string }>(
  `SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'jsonb'
    ORDER BY table_name, column_name`,
);

const found: string[] = [];
for (const { table_name, column_name } of columns) {
  const where = `${table_name}.${column_name}`;
  if (ALLOWED.has(where)) continue;
  // Identifiers come from the catalogue, quoted as identifiers, never from input.
  const [row] = await queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM "${table_name}" WHERE jsonb_typeof("${column_name}") = 'string'`,
  );
  if (Number(row.n) > 0) found.push(`${where}: ${row.n} row(s)`);
}

await closePool();
if (found.length > 0) {
  console.error("jsonb columns holding a JSON string instead of the value (write through $n::text::jsonb):");
  for (const line of found) console.error(`  ${line}`);
  Deno.exit(1);
}
console.log(`jsonb columns checked: ${columns.length} — none holds a string`);
