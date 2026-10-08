// The storm that took the node down (W15-NC): twenty writers through lib/db.ts
// while every backend of the database is killed every 50–250 ms, for ten
// seconds. On postgres.js the process died in 12 runs of 12 — an uncaught
// TypeError or an unhandled rejection, which deno test reports as a failure of
// its own. Here the process has to live, the pool has to answer afterwards,
// no connection may be left inside a transaction, and LISTEN has to report the
// gap and hear again.

import { assert, assertEquals } from "jsr:@std/assert@1";
import pg from "npm:pg@8.13.1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("SESSION_SECRET", "db-storm-secret");

const db = await import("../src/lib/db.ts");
const url = Deno.env.get("DATABASE_URL")!;

Deno.test("the node survives a storm of killed connections and recovers", async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("CREATE TABLE IF NOT EXISTS w15nc_storm (id serial PRIMARY KEY, a text, b text)");

  let lost = 0;
  const off = db.onListenLost(() => lost++);
  const heard: string[] = [];
  await db.listen("w15nc_storm", (p) => heard.push(p));

  let ok = 0, failed = 0, kills = 0;
  const end = Date.now() + 10_000;
  const writer = async (i: number) => {
    while (Date.now() < end) {
      const a = "x".repeat(Math.floor(Math.random() * 2000));
      const b = "y".repeat(Math.floor(Math.random() * 1500));
      const done = i % 4 === 0
        ? db.transaction(async (q) => {
          await q("INSERT INTO w15nc_storm (a, b) VALUES ($1, $2)", [a, b]);
          await q("SELECT count(*) FROM w15nc_storm");
        }).then(() => true, () => false)
        : db.query("SELECT length($1::text) + length($2::text) AS n", [a, b]).then((r) => r !== null);
      (await done) ? ok++ : failed++;
    }
  };
  const killer = async () => {
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 200));
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()",
      ).then(() => kills++, () => {});
    }
  };
  await Promise.all([...Array(20).keys()].map(writer).concat([killer()]));

  for (let i = 0; i < 100 && !heard.includes("after"); i++) {
    await admin.query("SELECT pg_notify('w15nc_storm', 'after')").catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  }
  const after = await db.queryOrThrow<{ n: number }>("SELECT 1 AS n");
  const idle = await admin.query(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%'",
  );
  console.log(JSON.stringify({ kills, ok, failed, lost, heardAfter: heard.includes("after") }));

  assert(kills > 0, "the killer killed nothing");
  assert(failed > 0, "no query failed: the storm did not reach the pool");
  assertEquals(after, [{ n: 1 }]);
  assertEquals(idle.rows[0].n, 0);
  assert(lost > 0, "LISTEN was killed and listenWasLost() was never called");
  assert(heard.includes("after"), "LISTEN did not hear a NOTIFY after the storm");

  off();
  await admin.query("DROP TABLE w15nc_storm");
  await admin.end();
  await db.closePool();
});
