// W15-NC, task 11: what db.ts on node-postgres does with the inputs the review
// panel could only guess at — array parameters, a DSN that carries its own
// options or sslmode, and a password left for ~/.pgpass to supply. Each case
// rebuilds the pool from a changed config.databaseUrl, so it is the node's own
// clientConfig() under test, not a hand-made client.
//
// Needs DATABASE_URL (scripts/run-relay-database-tests.sh).
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { config } from "../src/config.ts";
import * as db from "../src/lib/db.ts";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}
const opts = { ignore: !url, sanitizeOps: false, sanitizeResources: false };

// config is read-only to the type checker, a plain object at run time.
const setDsn = (dsn: string) => ((config as { databaseUrl: string }).databaseUrl = dsn);

async function withDsn<T>(dsn: string, step: () => Promise<T>): Promise<T> {
  await db.closePool();
  const before = config.databaseUrl;
  setDsn(dsn);
  try {
    return await step();
  } finally {
    await db.closePool();
    setDsn(before);
  }
}
function dsnWith(change: (u: URL) => void): string {
  const u = new URL(url!);
  change(u);
  return u.toString();
}

const UUIDS = ["7f0c1b7e-8a39-4f0e-9a51-2b0c4a6f9d11", "0b9d2e44-1c3a-4b8e-8d7f-6a5e4c3b2a10"];

Deno.test({
  ...opts,
  name: "array parameters reach Postgres whole: uuid[], int[], unnest of text[] with timestamptz[]",
  async fn() {
    // identity_sweeper.ts:163, take_down.ts:217
    const u = await db.queryOrThrow<{ n: number; second: string }>(
      "SELECT array_length($1::uuid[], 1) AS n, ($1::uuid[])[2]::text AS second",
      [UUIDS],
    );
    assertEquals(u, [{ n: 2, second: UUIDS[1] }]);
    // tables.ts:198
    const i = await db.queryOrThrow<{ v: number }>("SELECT v FROM unnest($1::int[]) AS v ORDER BY v", [[3, 1, 4]]);
    assertEquals(i.map((r) => r.v), [1, 3, 4]);
    // rate_limit.ts:512 — microseconds included: pg sends the strings as they are.
    const t = await db.queryOrThrow<{ k: string; t: string }>(
      `SELECT k, to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS t
         FROM unnest($1::text[], $2::timestamptz[]) AS u(k, t) ORDER BY k`,
      [["a,b", 'q"c'], ["2026-09-21T09:00:00.500900Z", "2026-09-22T00:00:00Z"]],
    );
    assertEquals(t, [
      { k: "a,b", t: "2026-09-21 09:00:00.500900" },
      { k: 'q"c', t: "2026-09-22 00:00:00.000000" },
    ]);
    // An empty array is an array, not a NULL.
    const e = await db.queryOrThrow<{ n: number }>("SELECT cardinality($1::uuid[]) AS n", [[]]);
    assertEquals(e, [{ n: 0 }]);
  },
});

Deno.test({
  ...opts,
  name: "an ?options= in DATABASE_URL does not loosen the node's statement and idle timeouts",
  async fn() {
    const dsn = dsnWith((u) => u.searchParams.set("options", "-c statement_timeout=0 -c idle_in_transaction_session_timeout=0"));
    const got = await withDsn(dsn, () =>
      db.queryOrThrow<{ s: string; i: string }>(
        "SELECT current_setting('statement_timeout') AS s, current_setting('idle_in_transaction_session_timeout') AS i",
      ));
    // 15 s unless RELAY_DB_TIMEOUT_MS says otherwise (db.ts statementTimeoutMs()).
    const ms = Number(Deno.env.get("RELAY_DB_TIMEOUT_MS")) || 15_000;
    const want = ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
    assertEquals(got, [{ s: want, i: want }], "the DSN's options replaced the node's own");
  },
});

Deno.test({
  ...opts,
  name: "sslmode in DATABASE_URL: disable connects in clear, require refuses a server without TLS",
  async fn() {
    const clear = await withDsn(dsnWith((u) => u.searchParams.set("sslmode", "disable")), () =>
      db.queryOrThrow<{ ssl: boolean }>("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"));
    assertEquals(clear, [{ ssl: false }]);
    // The test server has no TLS: "require" must fail rather than fall back to clear text.
    await withDsn(dsnWith((u) => u.searchParams.set("sslmode", "require")), async () => {
      await assertRejects(() => db.queryOrThrow("SELECT 1"));
    });
  },
});

Deno.test({
  ...opts,
  // Documented, not refused (coordinator, NC-G): whoever can set PGPASSFILE in
  // the node's env can set DATABASE_URL too, so the file grants nothing new.
  // Pinned so a driver change that drops it is seen, not discovered.
  name: "a DSN without a password takes it from PGPASSFILE when the env names one",
  async fn() {
    const real = new URL(url!);
    const dir = await Deno.makeTempDir();
    const file = `${dir}/pgpass`;
    await Deno.writeTextFile(file, `*:*:*:${decodeURIComponent(real.username)}:${decodeURIComponent(real.password)}\n`);
    await Deno.chmod(file, 0o600);
    const before = Deno.env.get("PGPASSFILE");
    Deno.env.set("PGPASSFILE", file);
    try {
      const noPassword = dsnWith((u) => (u.password = ""));
      const outcome = await withDsn(noPassword, () =>
        db.queryOrThrow("SELECT 1").then(() => "connected with the file's password", (e) => `refused: ${e}`));
      assertEquals(outcome, "connected with the file's password");
    } finally {
      before === undefined ? Deno.env.delete("PGPASSFILE") : Deno.env.set("PGPASSFILE", before);
      await Deno.remove(dir, { recursive: true });
    }
  },
});
