// lib/db.ts on node-postgres (W15-NC): what pg leaves to the caller and the
// file has to do itself, each case measured against a live Postgres.
//
// docs/reviews/PANEL_2026-10-09_pg-driver-plan.md, tasks 1, 2, 5, 6, 7:
//   - a COMMIT after a caught failure rolls back without an error — refused;
//   - a ROLLBACK that fails destroys the connection instead of pooling it;
//   - listen() never rejects, comes up when the database does, and reports
//     every gap through listenWasLost();
//   - undefined parameters are refused, no-parameter text may hold several
//     statements, `date` and `interval` read as postgres.js read them;
//   - a dropped connection is DbUnavailable, a refusal by the server is not;
//   - closePool() leaves nothing running (the test sanitizers check that).

import { assert, assertEquals, assertInstanceOf, assertRejects } from "jsr:@std/assert@1";
import pg from "npm:pg@8.13.1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("SESSION_SECRET", "db-driver-secret");

const db = await import("../src/lib/db.ts");
const url = Deno.env.get("DATABASE_URL")!;

// The module's pool outlives each case, as in every database suite here; the
// last case starts and ends with no pool and keeps the sanitizers on.
const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

// `database` other than the one under test: a database cannot refuse
// connections while the session asking is connected to it.
async function admin<T>(use: (client: pg.Client) => Promise<T>, database?: string): Promise<T> {
  const target = new URL(url);
  if (database) target.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: target.href });
  await client.connect();
  try {
    return await use(client);
  } finally {
    await client.end();
  }
}

async function until(what: string, ok: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

await db.queryOrThrow("CREATE TABLE IF NOT EXISTS w15nc_driver (n int PRIMARY KEY)");

test("a failure caught inside the transaction, without a savepoint, rejects it and writes nothing", async () => {
  await db.queryOrThrow("DELETE FROM w15nc_driver");
  const error = await assertRejects(() =>
    db.transaction(async (q) => {
      await q("INSERT INTO w15nc_driver VALUES (1)");
      await q("INSERT INTO w15nc_driver VALUES (1)").catch(() => "caught");
      return "callback finished";
    })
  );
  // The statement's own error, as postgres.js gave it (B69).
  assertEquals((error as { code?: string }).code, "23505");
  assertEquals(await db.queryOrThrow("SELECT n FROM w15nc_driver"), []);
});

test("the same failure under a savepoint goes back alone and the rest commits", async () => {
  await db.queryOrThrow("DELETE FROM w15nc_driver");
  const out = await db.transaction(async (q) => {
    await q("INSERT INTO w15nc_driver VALUES (1)");
    await db.savepoint(q, (s) => s("INSERT INTO w15nc_driver VALUES (1)")).catch(() => "caught");
    await q("INSERT INTO w15nc_driver VALUES (2)");
    return "done";
  });
  assertEquals(out, "done");
  assertEquals(await db.queryOrThrow<{ n: number }>("SELECT n FROM w15nc_driver ORDER BY n"), [{ n: 1 }, { n: 2 }]);
});

test("a throw rolls back and is the error the caller sees; the connection is clean afterwards", async () => {
  await db.queryOrThrow("DELETE FROM w15nc_driver");
  await assertRejects(
    () =>
      db.transaction(async (q) => {
        await q("INSERT INTO w15nc_driver VALUES (3)");
        throw new Error("first");
      }),
    Error,
    "first",
  );
  assertEquals(await db.queryOrThrow("SELECT n FROM w15nc_driver"), []);
  for (let i = 0; i < 8; i++) {
    const [row] = await db.queryOrThrow<{ tx: string | null }>("SELECT txid_current_if_assigned()::text AS tx");
    assertEquals(row.tx, null);
  }
});

test("a transaction whose backend is killed fails as DbUnavailable and leaves no transaction behind", async () => {
  const error = await assertRejects(() =>
    db.transaction(async (q) => {
      await q("SELECT pg_terminate_backend(pg_backend_pid())");
    })
  );
  assertInstanceOf(error, db.DbUnavailable);
  const idle = await admin(async (c) =>
    (await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%'"))
      .rows[0].n as number
  );
  assertEquals(idle, 0);
  assertEquals(await db.queryOrThrow("SELECT 1 AS n"), [{ n: 1 }]);
});

test("the server refusing a statement is not DbUnavailable", async () => {
  const error = await assertRejects(() => db.queryOrThrow("SELECT * FROM w15nc_no_such_table"));
  assert(!(error instanceof db.DbUnavailable));
  assertEquals((error as { code?: string }).code, "42P01");
});

test("undefined as a parameter is refused before it reaches the database", async () => {
  await assertRejects(() => db.queryOrThrow("SELECT $1::text AS v", [undefined]), TypeError, "undefined");
  assertEquals(await db.query("SELECT $1::text AS v", [undefined]), null);
  assertEquals(await db.queryOrThrow("SELECT $1::text AS v", [null]), [{ v: null }]);
});

test("text without parameters may hold several statements; the last one answers", async () => {
  const rows = await db.queryOrThrow<{ n: number }>("SELECT 1 AS n; SELECT 2 AS n");
  assertEquals(rows, [{ n: 2 }]);
});

test("date and interval read as postgres.js read them", async () => {
  const [row] = await db.queryOrThrow<{ d: Date; i: string }>(
    "SELECT '2026-10-09'::date AS d, interval '90 minutes' AS i",
  );
  assertEquals(row.d.toISOString(), "2026-10-09T00:00:00.000Z");
  assertEquals(row.i, "01:30:00");
});

// Can go red only away from UTC — and scripts/run-relay-database-tests.sh runs
// at UTC, where pg's local midnight is UTC midnight. Its break was seen at
// TZ=Europe/Berlin (W15-NC, 2026-10-09); the date case above, likewise.
test("a date[] reads each day at UTC midnight, NULL as null", async () => {
  const [row] = await db.queryOrThrow<{ v: (Date | null)[] }>(
    "SELECT ARRAY['2026-10-09'::date, NULL, '2026-01-01'::date] AS v",
  );
  assertEquals(row.v.map((d) => d?.toISOString() ?? null), [
    "2026-10-09T00:00:00.000Z",
    null,
    "2026-01-01T00:00:00.000Z",
  ]);
});

test("a microsecond timestamp in a string parameter reaches Postgres whole", async () => {
  const [row] = await db.queryOrThrow<{ us: string }>(
    "SELECT to_char($1::timestamptz AT TIME ZONE 'UTC', 'US') AS us",
    ["2026-09-21T09:00:00.500900Z"],
  );
  assertEquals(row.us, "500900");
});

test("both timeouts are set on every connection", async () => {
  const [row] = await db.queryOrThrow<{ s: string; i: string }>(
    "SELECT current_setting('statement_timeout') AS s, current_setting('idle_in_transaction_session_timeout') AS i",
  );
  assertEquals(row, { s: "15s", i: "15s" });
});

test("listen comes up with the database, hears, and reports each gap", async () => {
  await db.closePool();
  let lost = 0;
  const off = db.onListenLost(() => lost++);
  const heard: string[] = [];
  const dbname = new URL(url).pathname.slice(1);
  // Connected first: a session already in is not turned out by the refusal.
  await admin(async (c) => {
    // The database refuses new connections: the node's LISTEN cannot come up.
    await admin(async (other) => {
      await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS false`);
      try {
        // Resolves anyway — a rejection here would be cached by chat/relay.ts.
        await db.listen("w15nc_driver", (p) => heard.push(p));
        await new Promise((r) => setTimeout(r, 400));
        assertEquals(lost, 0);
      } finally {
        await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS true`);
      }
    }, "postgres");
    // It comes up by itself, and says the gap happened.
    await until("listen to come up after the outage", () => lost >= 1, 15_000);
    await until("a notification after recovery", () => {
      c.query("SELECT pg_notify('w15nc_driver', 'after-outage')").catch(() => {});
      return heard.includes("after-outage");
    });
    // An established LISTEN connection that drops is one more gap, and it
    // comes back by itself.
    const before = lost;
    await c.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN%' AND pid <> pg_backend_pid()",
    );
    await until("the drop to be reported", () => lost === before + 1);
    await until("a notification after the drop", () => {
      c.query("SELECT pg_notify('w15nc_driver', 'after-drop')").catch(() => {});
      return heard.includes("after-drop");
    });
  });
  off();
  await db.closePool();
});

Deno.test("closePool stops listening and leaves no timer or socket", async () => {
  await db.listen("w15nc_driver_close", () => {});
  await db.closePool();
  await db.closePool();
  assertEquals(await db.queryOrThrow("SELECT 1 AS n"), [{ n: 1 }]);
  await db.queryOrThrow("DROP TABLE w15nc_driver");
  await db.closePool();
});
