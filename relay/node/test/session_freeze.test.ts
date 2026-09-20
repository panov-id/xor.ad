// Freezing a session announces itself, and the announcement is part of the
// transaction — not a courtesy after it.
//
// Chat spec §8.2 promises a frozen session "loses access immediately, including
// the delivery subscription". The row alone cannot keep that promise: a socket
// is checked when it is opened and then lives on by itself. `NOTIFY
// session_frozen` is what reaches a connection that is already open, so this
// suite holds the notification itself, not just the column.
//
// **Read this before writing the listener.** The driver the node uses,
// @db/postgres@0.19.5, cannot receive notifications: it throws
// "Unexpected simple query message: A" on the next query of a connection that
// has been sent one (connection/connection.ts:765). That is why the assertion
// below is shaped the way it is — the throw is the only observable proof the
// notification arrived, and it is a positive control, not a workaround. The
// listening half of §8.2 therefore needs a different driver or a different bus,
// and that is recorded in docs/open-work_{RU,EN}.md rather than here.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { Client } from "jsr:@db/postgres@0.19";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const { freezeSession } = await import("../src/lib/sessions.ts");
const database = await import("../src/lib/db.ts");

// The pool is warmed here rather than by the first test that needs it: its
// connections are opened lazily, and a connection opened *during* a test is a
// leak by Deno's reckoning even when the pool goes on owning it.
await database.queryOrThrow("SELECT 1");

// A session needs an identity, and identities carry required columns; the two
// rows are made here rather than through the routes, because what is under test
// is one function and one channel, not a registration.
async function makeSession(): Promise<string> {
  const identityId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
       VALUES ($1, 'freeze-suite', 30, 'not-a-real-key', now())`,
    [identityId],
  );
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key)
       VALUES ($1, $2, 'not-a-real-key', 'not-a-real-key')`,
    [sessionId, identityId],
  );
  return sessionId;
}

// Was a notification delivered to this connection? The driver answers by
// throwing, so a passing query means nothing arrived.
async function received(listener: Client): Promise<boolean> {
  try {
    await listener.queryObject("SELECT 1");
    return false;
  } catch (error) {
    assert(
      /Unexpected simple query message: A/.test(String(error)),
      `the listening connection failed for some other reason: ${error}`,
    );
    return true;
  }
}

Deno.test("a freeze is announced on session_frozen, and the row carries the reason", async () => {
  const sessionId = await makeSession();
  const listener = new Client(url);
  await listener.connect();
  await listener.queryObject("LISTEN session_frozen");

  const froze = await database.transaction((run) => freezeSession(run, sessionId, "pin_limit"));
  assert(froze, "freezeSession said it did not freeze a live session");
  assert(await received(listener), "the freeze was not announced on session_frozen");

  const [row] = await database.queryOrThrow<{ frozen_at: Date; frozen_reason: string }>(
    `SELECT frozen_at, frozen_reason FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assert(row.frozen_at, "the session was not frozen");
  assertEquals(row.frozen_reason, "pin_limit");
  await listener.end();
});

// The negative control, in both directions. Without it the check above would
// pass on a connection that throws for any reason at all, and a second freeze
// that re-announced itself would go unnoticed.
Deno.test("a quiet channel stays quiet, and a second freeze says nothing", async () => {
  const sessionId = await makeSession();
  const listener = new Client(url);
  await listener.connect();
  await listener.queryObject("LISTEN session_frozen");

  assertEquals(await received(listener), false, "something was announced before any freeze");

  await database.transaction((run) => freezeSession(run, sessionId, "closed"));
  assert(await received(listener), "the freeze was not announced");

  // Already frozen: no row changes, so nothing is announced and the first
  // reason stands.
  const again = await database.transaction((run) => freezeSession(run, sessionId, "transfer"));
  assertEquals(again, false, "an already-frozen session reported a fresh freeze");
  assertEquals(await received(listener), false, "a freeze that wrote nothing still announced");

  const [row] = await database.queryOrThrow<{ frozen_reason: string }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assertEquals(row.frozen_reason, "closed", "the second freeze overwrote the first reason");
  await listener.end();
});

// A rolled-back freeze must not be announced: Postgres holds notifications
// until COMMIT for exactly this reason, and a listener told about a freeze that
// did not happen would tear down a live person's sockets.
Deno.test("a freeze that is rolled back is never announced", async () => {
  const sessionId = await makeSession();
  const listener = new Client(url);
  await listener.connect();
  await listener.queryObject("LISTEN session_frozen");

  await database.transaction(async (run) => {
    await freezeSession(run, sessionId, "pin_limit");
    throw new Error("deliberate rollback");
  }).catch(() => {});

  assertEquals(await received(listener), false, "a rolled-back freeze was announced");
  const [row] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assertEquals(row.frozen_at, null, "a rolled-back freeze reached the table");
  await listener.end();
});

// No pool-closing case: this suite's connections are opened by the pool before
// the first test runs, and Deno's leak checker calls closing them inside a test
// a leak. The process ends when the suite does, and the throwaway Postgres goes
// with it.
addEventListener("unload", () => {
  database.closePool();
});
