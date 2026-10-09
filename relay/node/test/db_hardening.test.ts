// The security lens on lib/db.ts (docs/reviews/PANEL_2026-10-09_pg-driver-code.md,
// H1–H5), each finding put to a live Postgres before anything was changed:
//   H1 opening rooms while the database is down must not outrun the LISTEN
//      backoff — each room opening was a fresh connection attempt;
//   H2 the LISTEN connection gives up on a server that never answers, as the
//      pool does, instead of waiting for the operating system;
//   H3 `?statement_timeout=0` (and its idle sibling) as keys of DATABASE_URL do
//      not loosen the node's timeouts, as `?options=` does not (db_dsn);
//   H5 `undefined` inside an array parameter is refused, not sent as NULL.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import pg from "npm:pg@8.13.1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("SESSION_SECRET", "db-hardening-secret");

const { config } = await import("../src/config.ts");
const db = await import("../src/lib/db.ts");
const url = Deno.env.get("DATABASE_URL")!;
const dbname = new URL(url).pathname.slice(1);

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

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

test("H1: opening rooms while the database refuses does not outrun the LISTEN backoff", async () => {
  await db.closePool();
  // Every connection attempt in this process — db.ts and pg share the module.
  let attempts = 0;
  const connect = pg.Client.prototype.connect;
  pg.Client.prototype.connect = function (this: unknown, ...args: unknown[]) {
    attempts++;
    return (connect as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof connect;
  try {
    await admin(async (other) => {
      await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS false`);
      try {
        // Twenty rooms open within a second, one after another.
        const end = Date.now() + 1_000;
        for (let i = 0; i < 20; i++) {
          await db.listen(`w15nc_h1_${i % 3}`, () => {});
          await new Promise((r) => setTimeout(r, Math.max(0, (end - Date.now()) / (20 - i))));
        }
      } finally {
        await other.query(`ALTER DATABASE ${dbname} ALLOW_CONNECTIONS true`);
      }
    }, "postgres");
  } finally {
    pg.Client.prototype.connect = connect;
  }
  // The schedule allows 100 + 200 + 400 ms (with jitter, half of each at least)
  // inside one second: five attempts at the very most.
  assert(attempts <= 5, `${attempts} connection attempts in one second of room openings`);
  await db.closePool();
});

test("H2: the LISTEN connection gives up on a server that never answers", async () => {
  // Accepts the TCP connection and says nothing, as a half-dead box does.
  const silent = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const held: Deno.Conn[] = [];
  (async () => {
    for await (const conn of silent) held.push(conn);
  })().catch(() => {});
  const port = (silent.addr as Deno.NetAddr).port;
  Deno.env.set("RELAY_DB_TIMEOUT_MS", "1000");
  const within = <T>(ms: number, work: Promise<T>) =>
    Promise.race([work, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
  const before = config.databaseUrl;
  await db.closePool();
  setDsn(`postgres://relay:test@127.0.0.1:${port}/${dbname}`);
  try {
    const start = Date.now();
    const listened = await within(6_000, db.listen("w15nc_h2", () => {}));
    const took = Date.now() - start;
    assert(listened !== "timeout", "listen() was still waiting on the silent server after 6 s");
    assert(took < 3_000, `listen() took ${took} ms with a 1 s connection timeout`);
  } finally {
    // Closing the server first lets a hung connect end, so a red run stays red
    // instead of hanging the suite in closePool().
    silent.close();
    for (const conn of held) conn.close();
    await within(5_000, db.closePool());
    setDsn(before);
    Deno.env.delete("RELAY_DB_TIMEOUT_MS");
  }
});

test("H4: a LISTEN connection whose database falls silent is dropped by the ping, and the rooms are told", async () => {
  // A relay between the node and the real database that, on cue, stops passing
  // bytes either way and closes nothing — a box gone without a FIN.
  const target = new URL(url);
  const relay = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const conns: Deno.Conn[] = [];
  let frozen = false;
  const pipe = async (from: Deno.Conn, to: Deno.Conn) => {
    const buffer = new Uint8Array(16_384);
    for (;;) {
      const n = await from.read(buffer).catch(() => null);
      if (n === null) return;
      if (frozen) continue; // swallowed: the other side hears nothing, ever
      await to.write(buffer.subarray(0, n)).catch(() => {});
    }
  };
  (async () => {
    for await (const inbound of relay) {
      const outbound = await Deno.connect({ hostname: target.hostname, port: Number(target.port || 5432) });
      conns.push(inbound, outbound);
      pipe(inbound, outbound);
      pipe(outbound, inbound);
    }
  })().catch(() => {});
  const port = (relay.addr as Deno.NetAddr).port;
  const relayed = new URL(url);
  relayed.hostname = "127.0.0.1";
  relayed.port = String(port);

  // Ping every 500 ms, answer within 500 ms: lost within a second of silence.
  Deno.env.set("RELAY_DB_TIMEOUT_MS", "500");
  const before = config.databaseUrl;
  await db.closePool();
  setDsn(relayed.toString());
  let lostAt = 0;
  const unsubscribe = db.onListenLost(() => (lostAt ||= Date.now()));
  try {
    await db.listen("w15nc_h4", () => {});
    assertEquals(db.listenState(), "up", "the LISTEN connection did not come up through the relay");
    // Two pings answered while the database still speaks: no loss.
    await new Promise((r) => setTimeout(r, 1_200));
    assertEquals(lostAt, 0, "the ping dropped a LISTEN connection whose database was answering");

    frozen = true;
    const silentFrom = Date.now();
    while (!lostAt && Date.now() - silentFrom < 3_000) await new Promise((r) => setTimeout(r, 50));
    assert(lostAt > 0, "a LISTEN connection to a silent database was still up after 3 s: the rooms on it are deaf");
    const took = lostAt - silentFrom;
    // At most a period and a timeout, plus the loop's step.
    assert(took <= 1_000 + 200, `the silent database was noticed after ${took} ms, past a 500 ms period and a 500 ms timeout`);
  } finally {
    unsubscribe();
    frozen = false;
    relay.close();
    for (const conn of conns) {
      try {
        conn.close();
      } catch { /* already closed */ }
    }
    await db.closePool();
    setDsn(before);
    Deno.env.delete("RELAY_DB_TIMEOUT_MS");
  }
});

test("H3: statement_timeout and idle_in_transaction_session_timeout as DSN keys do not loosen ours", async () => {
  const dsn = new URL(url);
  dsn.searchParams.set("statement_timeout", "0");
  dsn.searchParams.set("idle_in_transaction_session_timeout", "0");
  const read = () =>
    db.queryOrThrow<{ s: string; i: string }>(
      "SELECT current_setting('statement_timeout') AS s, current_setting('idle_in_transaction_session_timeout') AS i",
    );
  const pooled = await withDsn(dsn.toString(), read);
  assertEquals(pooled, [{ s: "15s", i: "15s" }], "the DSN's keys replaced the node's timeouts on the pool");
  const inTransaction = await withDsn(dsn.toString(), () => db.transaction((q) => q<{ s: string }>(
    "SELECT current_setting('statement_timeout') AS s",
  )));
  assertEquals(inTransaction, [{ s: "15s" }]);
});

test("H5: undefined inside an array parameter is refused, not sent as NULL", async () => {
  await assertRejects(
    () => db.queryOrThrow("SELECT cardinality($1::int[]) AS n", [[1, undefined, 3]]),
    TypeError,
    "undefined",
  );
  await assertRejects(
    () => db.queryOrThrow("SELECT cardinality($1::int[]) AS n", [[[1], [undefined]]]),
    TypeError,
    "undefined",
  );
  // null stays a NULL element, as it always was.
  assertEquals(await db.queryOrThrow("SELECT ($1::int[])[2] IS NULL AS v", [[1, null, 3]]), [{ v: true }]);
  await db.closePool();
});
