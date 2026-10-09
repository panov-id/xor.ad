// Facts the review lenses claimed about pg 8.13.1, measured against a live Postgres.
import pg from "npm:pg@8.13.1";
const url = Deno.env.get("DATABASE_URL")!;
const out: Record<string, unknown> = {};
const tryIt = async (k: string, f: () => Promise<unknown>) => {
  try { out[k] = await f(); } catch (e) {
    const err = e as Error & { code?: string };
    out[k] = { threw: err.constructor?.name, code: err.code ?? null, message: String(err.message).slice(0, 90) };
  }
};
const pool = new pg.Pool({ connectionString: url, max: 4 });
pool.on("error", () => {});
await pool.query("CREATE TABLE IF NOT EXISTS f (id int PRIMARY KEY, b bytea, d date, n text)");

// A: caught error inside BEGIN, then COMMIT
await tryIt("A_commit_after_caught_error", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO f(id) VALUES (1)");
    await c.query("SELECT 1/0").catch(() => {});
    const r = await c.query("COMMIT");
    const rows = (await pool.query("SELECT count(*)::int AS n FROM f WHERE id = 1")).rows[0].n;
    return { commitCommand: r.command, rowsCommitted: rows };
  } finally { c.release(); }
});
// B: undefined parameter
await tryIt("B_undefined_param", async () => (await pool.query("SELECT $1::text IS NULL AS isnull", [undefined])).rows[0]);
// C: Uint8Array into bytea
await tryIt("C_uint8array_bytea", async () => {
  const u = new Uint8Array([1, 2, 3, 250]);
  await pool.query("INSERT INTO f(id, b) VALUES (2, $1)", [u]);
  const r = (await pool.query("SELECT octet_length(b) AS len, encode(b,'hex') AS hex FROM f WHERE id = 2")).rows[0];
  return r;
});
// D: date output under TZ
await tryIt("D_date_out", async () => {
  const v = (await pool.query("SELECT '2026-10-09'::date AS d")).rows[0].d;
  return { tz: Deno.env.get("TZ") ?? "unset", type: v?.constructor?.name, iso: v instanceof Date ? v.toISOString() : v };
});
// E: multi-statement with empty args
await tryIt("E_multi_empty_args", async () => {
  const r = await pool.query("SELECT 1 AS a; SELECT 2 AS b", []);
  return { isArray: Array.isArray(r), rows: (r as unknown as { rows?: unknown }).rows ?? null };
});
await tryIt("E2_multi_no_args", async () => {
  const r = await pool.query("SELECT 1 AS a; SELECT 2 AS b");
  return { isArray: Array.isArray(r) };
});
// F: microseconds in a string timestamp parameter
await tryIt("F_micro_string", async () => (await pool.query("SELECT to_char($1::timestamptz AT TIME ZONE 'UTC', 'US') AS us", ["2026-09-21T09:00:00.500900Z"])).rows[0]);
// G: pool defaults
out.G_pool_defaults = { connectionTimeoutMillis: (pool as unknown as { options: Record<string, unknown> }).options.connectionTimeoutMillis ?? "undefined", idleTimeoutMillis: (pool as unknown as { options: Record<string, unknown> }).options.idleTimeoutMillis ?? "undefined" };
// H: error shape when our own backend is killed mid-query
await tryIt("H_killed_query", async () => {
  const c = await pool.connect();
  c.on("error", () => {});
  const pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
  const admin = new pg.Client({ connectionString: url }); await admin.connect();
  const q = c.query("SELECT pg_sleep(5)");
  await new Promise((r) => setTimeout(r, 300));
  await admin.query("SELECT pg_terminate_backend($1)", [pid]);
  await admin.end();
  try { await q; return "no error"; } finally { c.release(true); }
});
await tryIt("H2_query_on_dead_client", async () => {
  const c = new pg.Client({ connectionString: url }); c.on("error", () => {}); await c.connect();
  const pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
  const admin = new pg.Client({ connectionString: url }); await admin.connect();
  await admin.query("SELECT pg_terminate_backend($1)", [pid]); await admin.end();
  await new Promise((r) => setTimeout(r, 300));
  return await c.query("SELECT 1");
});
await tryIt("H3_connect_refused", async () => {
  const c = new pg.Client({ connectionString: "postgres://relay:test@127.0.0.1:1/x", connectionTimeoutMillis: 2000 });
  await c.connect();
});
// I: DatabaseError identity
await tryIt("I_database_error_class", async () => {
  try { await pool.query("SELECT 1/0"); } catch (e) {
    return { name: (e as Error).constructor.name, instanceofPgDatabaseError: e instanceof (pg as unknown as { DatabaseError: new () => Error }).DatabaseError, code: (e as { code?: string }).code };
  }
});
// J: untyped $n arithmetic
await tryIt("J_untyped_arith", async () => (await pool.query("SELECT x FROM generate_series(1,10) x LIMIT greatest(0, $1 - 7)", [10])).rows.length);
await tryIt("J2_untyped_plus", async () => (await pool.query("SELECT $1 + 1 AS v", [41])).rows[0]);

await pool.end();
console.log(JSON.stringify(out, null, 1));
