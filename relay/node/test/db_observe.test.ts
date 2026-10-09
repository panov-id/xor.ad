// What lib/db.ts says about itself while the database misbehaves (W15-NC,
// docs/reviews/PANEL_2026-10-09_pg-driver-plan.md task 9):
//   - an idle pool connection that dies is one warn line, with nothing of the
//     client in it — its connection parameters carry the password;
//   - a LISTEN outage is a line where it starts and a line where it ends, with
//     the attempts and the time down — not a line per attempt, which at a
//     retry every 100 ms is a storm in the log and in storage;
//   - /health says whether the node is hearing: idle, up, down.

import { assert, assertEquals } from "jsr:@std/assert@1";
import pg from "npm:pg@8.13.1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("SESSION_SECRET", "db-observe-secret");

const db = await import("../src/lib/db.ts");
const { health } = await import("../src/routes/health.ts");
const url = Deno.env.get("DATABASE_URL")!;
const dbname = new URL(url).pathname.slice(1);

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

// Every line the node writes, parsed, while `during` runs.
async function lines(during: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const seen: Record<string, unknown>[] = [];
  const { log, error } = console;
  const take = (text: unknown) => {
    try {
      seen.push(JSON.parse(String(text)));
    } catch { /* not a log line */ }
  };
  console.log = take;
  console.error = take;
  try {
    await during();
  } finally {
    console.log = log;
    console.error = error;
  }
  return seen;
}

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

async function until(what: string, ok: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const listenField = async () => (await (await health()).json()).listen as string;

test("an idle pool connection that dies is one warn line with nothing of the client in it", async () => {
  await db.queryOrThrow("SELECT 1");
  const seen = await lines(async () => {
    await admin((c) =>
      c.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle'",
      )
    );
    await new Promise((r) => setTimeout(r, 300));
  });
  const dropped = seen.filter((l) => l.msg === "database connection dropped");
  assertEquals(dropped.length, 1, JSON.stringify(seen));
  assertEquals(dropped[0].level, "warn");
  assertEquals(Object.keys(dropped[0]).sort(), ["env", "error", "level", "msg", "node", "ts"]);
  assert(!JSON.stringify(dropped[0]).includes("connectionParameters"));
  assertEquals(await db.queryOrThrow("SELECT 1 AS n"), [{ n: 1 }]);
});

test("a LISTEN outage is two lines however many attempts it takes, and /health follows it", async () => {
  assertEquals(await listenField(), "idle");
  await db.listen("w15nc_observe", () => {});
  assertEquals(await listenField(), "up");

  // Connected first: a session already in is not turned out by the refusal.
  const seen = await lines(() => admin((c) => admin(async (other) => {
      await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS false`);
      try {
        await c.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN%' AND pid <> pg_backend_pid()",
        );
        await until("listen to go down", () => db.listenState() === "down");
        assertEquals(await listenField(), "down");
        // 100, 200, 400, 800 ms with jitter: several refused attempts.
        await new Promise((r) => setTimeout(r, 2_000));
      } finally {
        await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS true`);
      }
      await until("listen to come back", () => db.listenState() === "up");
    }, "postgres")));
  assertEquals(await listenField(), "up");

  const about = seen.filter((l) => String(l.msg).includes("LISTEN"));
  assertEquals(about.map((l) => [l.level, l.msg]), [
    ["warn", "database LISTEN connection lost"],
    ["info", "database LISTEN connection restored"],
  ]);
  const restored = about[1];
  assert(Number(restored.attempts) >= 3, `attempts: ${restored.attempts}`);
  assert(Number(restored.downMs) >= 2_000, `downMs: ${restored.downMs}`);
});

test("closePool leaves listen idle", async () => {
  await db.closePool();
  assertEquals(db.listenState(), "idle");
});
