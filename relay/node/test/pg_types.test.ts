// W15-NC step 1: the same queries through postgres.js (the node's driver until
// W15-NC) and through lib/db.ts on node-postgres, with its type parsers,
// compared by machine. Each case names what a caller would see.
//
// The differences that remain are listed below, each accepted for a reason; a
// new one, or one of them gone, is red — either the driver or db.ts changed
// what a caller reads, and someone should look before it ships.
//
// Run by scripts/run-relay-database-tests.sh, at TZ=Europe/Berlin: `date`
// read into a Date depends on the zone, and at UTC a wrong parser looks right.
import postgres from "npm:postgres@3.4.4";
import pg from "npm:pg@8.13.1";
import { assertEquals } from "jsr:@std/assert@1";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("SESSION_SECRET", "pg-types-secret");
const db = await import("../src/lib/db.ts");

// Name → why it is accepted.
const ACCEPTED: Record<string, string> = {
  "timestamptz in: string with microseconds":
    "postgres.js turned the string into a Date and cut it to milliseconds; pg sends it whole",
  "unnest text[] + timestamptz[] in": "the same microseconds, inside an array parameter",
  "timestamptz[] out": "postgres.js read a NULL element as an Invalid Date; pg reads null",
  "text[] out": "postgres.js read a NULL element as the string \"NULL\"; pg reads null",
  "jsonb in: string":
    "postgres.js encoded a JSON string again into a jsonb string; the node passes $n::text::jsonb, where both agree",
};

// One shape for both sides: what the value is, and how it prints.
function shape(v: unknown): unknown {
  if (v === null) return { null: true };
  if (v === undefined) return { undefined: true };
  if (v instanceof Date) return { Date: isNaN(v.getTime()) ? "Invalid" : v.toISOString() };
  if (v instanceof Uint8Array) return { bytes: Array.from(v) };
  if (Array.isArray(v)) return { array: v.map(shape) };
  if (typeof v === "object") {
    return { object: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shape(x)])) };
  }
  return { [typeof v]: v };
}

type Case = { name: string; text: string; args?: unknown[] };
const UUIDS = ["7f0c1b7e-8a39-4f0e-9a51-2b0c4a6f9d11", "0b9d2e44-1c3a-4b8e-8d7f-6a5e4c3b2a10"];
const CASES: Case[] = [
  { name: "timestamptz out", text: "SELECT '2026-09-21T09:00:00.500900Z'::timestamptz AS v" },
  { name: "timestamptz in: string with microseconds", text: "SELECT to_char($1::timestamptz AT TIME ZONE 'UTC', 'HH24:MI:SS.US') AS v", args: ["2026-09-21T09:00:00.500900Z"] },
  { name: "timestamptz in: Date", text: "SELECT ($1::timestamptz)::text AS v", args: [new Date("2026-09-21T09:00:00.500Z")] },
  { name: "timestamptz[] out", text: "SELECT ARRAY['2026-09-21T09:00:00Z'::timestamptz, NULL] AS v" },
  { name: "int8 out", text: "SELECT 9007199254740993::int8 AS v" },
  { name: "int8 small out", text: "SELECT 42::int8 AS v" },
  { name: "count(*) out", text: "SELECT count(*) AS v FROM generate_series(1, 3)" },
  { name: "bigserial-like out", text: "SELECT nextval('pg_types_seq') AS v" },
  { name: "int4 out", text: "SELECT 7::int4 AS v" },
  { name: "numeric out", text: "SELECT 12345678901234567890.123456789::numeric AS v" },
  { name: "float8 out", text: "SELECT 0.1::float8 AS v" },
  { name: "jsonb out", text: `SELECT '{"a":1,"b":[true,null],"c":"x"}'::jsonb AS v` },
  { name: "jsonb in: object", text: "SELECT ($1::jsonb)->>'a' AS v, jsonb_typeof($1::jsonb) AS t", args: [{ a: "x" }] },
  { name: "jsonb in: string", text: "SELECT jsonb_typeof($1::jsonb) AS v", args: [JSON.stringify({ a: 1 })] },
  { name: "json out", text: `SELECT '{"a":1}'::json AS v` },
  { name: "uuid[] in", text: "SELECT array_length($1::uuid[], 1) AS v, ($1::uuid[])[2]::text AS second", args: [UUIDS] },
  { name: "uuid[] out", text: `SELECT ARRAY['${UUIDS[0]}', '${UUIDS[1]}']::uuid[] AS v` },
  { name: "int[] in", text: "SELECT ($1::int[])[3] AS v, array_length($1::int[], 1) AS n", args: [[3, 1, 4]] },
  { name: "int[] out", text: "SELECT ARRAY[3, 1, 4]::int[] AS v" },
  { name: "text[] in", text: "SELECT ($1::text[])[2] AS v", args: [["a,b", 'q"uote', "c"]] },
  { name: "text[] out", text: `SELECT ARRAY['a,b', 'q"uote', NULL, '']::text[] AS v` },
  {
    name: "unnest text[] + timestamptz[] in",
    text: "SELECT k, to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS t FROM unnest($1::text[], $2::timestamptz[]) AS u(k, t) ORDER BY k",
    args: [["a", "b"], ["2026-09-21T09:00:00.500900Z", "2026-09-22T00:00:00Z"]],
  },
  { name: "bytea out", text: "SELECT '\\x00ff10'::bytea AS v" },
  { name: "bytea in: Uint8Array", text: "SELECT encode($1::bytea, 'hex') AS v, octet_length($1::bytea) AS n", args: [new Uint8Array([0, 255, 16, 32])] },
  { name: "bool out", text: "SELECT true AS t, false AS f" },
  { name: "bool in", text: "SELECT $1::bool AS v", args: [false] },
  { name: "null out", text: "SELECT NULL AS v, NULL::int AS i, NULL::timestamptz AS t" },
  { name: "null in", text: "SELECT $1::text IS NULL AS v", args: [null] },
  { name: "date out (1082)", text: "SELECT '2026-10-09'::date AS v" },
  { name: "date in: string", text: "SELECT ($1::date)::text AS v", args: ["2026-10-09"] },
  { name: "date[] out", text: "SELECT ARRAY['2026-10-09'::date] AS v" },
  { name: "untyped $n in arithmetic", text: "SELECT greatest(0, $1 - 3) AS v", args: [10] },
  { name: "untyped $n in LIMIT", text: "SELECT g AS v FROM generate_series(1, 5) g LIMIT greatest(0, $1 - 2)", args: [4] },
  { name: "interval out", text: "SELECT interval '1 day 02:03:04' AS v" },
];

Deno.test({
  name: "postgres.js and pg read and write the same values",
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const a = postgres(url!, { max: 1, onnotice: () => {} });
    const b = new pg.Client({ connectionString: url });
    await b.connect();
    await b.query("CREATE SEQUENCE IF NOT EXISTS pg_types_seq START 9007199254740990");
    const differ: string[] = [];
    try {
      for (const c of CASES) {
        await b.query("SELECT setval('pg_types_seq', 9007199254740990, false)");
        // deno-lint-ignore no-explicit-any
        const left = await a.unsafe(c.text, (c.args ?? []) as any[]).then((r) => shape([...r]), (e) => ({ error: String(e) }));
        await b.query("SELECT setval('pg_types_seq', 9007199254740990, false)");
        const right = await db.queryOrThrow(c.text, c.args ?? []).then(
          (r: unknown[]) => shape(r),
          (e: unknown) => ({ error: String(e) }),
        );
        if (JSON.stringify(left) !== JSON.stringify(right)) {
          differ.push(`${c.name}\n    postgres.js: ${JSON.stringify(left)}\n    pg:          ${JSON.stringify(right)}`);
        }
      }
    } finally {
      await a.end({ timeout: 1 });
      await b.end();
      await db.closePool();
    }
    // The report: every difference on its own lines, so the run's output is the list.
    if (differ.length) console.log(`TZ=${Deno.env.get("TZ") ?? "(unset)"} — ${differ.length} of ${CASES.length} differ:\n  ${differ.join("\n  ")}`);
    const names = differ.map((d) => d.split("\n")[0]).sort();
    assertEquals(names, Object.keys(ACCEPTED).sort(), "the differences between the drivers are not the accepted ones");
  },
});
