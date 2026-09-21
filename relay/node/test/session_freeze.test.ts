// Freezing a session announces itself, and the announcement is part of the
// transaction — not a courtesy after it.
//
// Chat spec §8.2 promises a frozen session "loses access immediately, including
// the delivery subscription". The row alone cannot keep that promise: a socket
// is checked when it is opened and then lives on by itself. `NOTIFY
// session_frozen` is what reaches a connection that is already open, so this
// suite holds the notification itself, not just the column.
//
// **The listener is real now.** Until 2026-09-21 the node's driver could not
// receive a notification at all — it threw on the next query of a connection
// that had been sent one — so these cases proved delivery by catching that
// throw: a positive control made of an exception, which is as close to a
// measurement as one could get and no closer. The driver is postgres.js since
// then (open-work G14, the owner's decision), `listen()` is a first-class call,
// and the cases below now read the payload and check it is the right session.

import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";

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

// One listening connection per case, and a queue of what arrived on it. The
// payload is the session id, so a case can check *which* session was announced
// rather than only that something was.
function listener() {
  const sql = postgres(url!, { max: 1 });
  const arrived: string[] = [];
  const ready = sql.listen("session_frozen", (payload: string) => {
    arrived.push(payload);
  });
  return {
    ready,
    arrived,
    // Notifications cross the wire on their own schedule; this waits for one
    // rather than assuming it has landed by the time the write returns.
    async waitFor(sessionId: string, ms = 2000): Promise<boolean> {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (arrived.includes(sessionId)) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return false;
    },
    async quiet(ms = 400): Promise<boolean> {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return arrived.length === 0;
    },
    close: () => sql.end(),
  };
}

Deno.test("a freeze is announced on session_frozen, and the payload names the session", async () => {
  const sessionId = await makeSession();
  const heard = listener();
  await heard.ready;

  const froze = await database.transaction((run) => freezeSession(run, sessionId, "pin_limit"));
  assert(froze, "freezeSession said it did not freeze a live session");
  assert(
    await heard.waitFor(sessionId),
    `the freeze was not announced; heard instead: ${JSON.stringify(heard.arrived)}`,
  );

  const [row] = await database.queryOrThrow<{ frozen_at: Date; frozen_reason: string }>(
    `SELECT frozen_at, frozen_reason FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assert(row.frozen_at, "the session was not frozen");
  assertEquals(row.frozen_reason, "pin_limit");
  await heard.close();
});

// The negative control, in both directions: a channel nobody has written to
// says nothing, and a freeze that changed no row says nothing either.
Deno.test("a quiet channel stays quiet, and a second freeze says nothing", async () => {
  const sessionId = await makeSession();
  const heard = listener();
  await heard.ready;

  assert(await heard.quiet(), `something was announced before any freeze: ${heard.arrived}`);

  await database.transaction((run) => freezeSession(run, sessionId, "closed"));
  assert(await heard.waitFor(sessionId), "the freeze was not announced");

  // Already frozen: no row changes, so nothing is announced and the first
  // reason stands.
  const before = heard.arrived.length;
  const again = await database.transaction((run) => freezeSession(run, sessionId, "transfer"));
  assertEquals(again, false, "an already-frozen session reported a fresh freeze");
  await new Promise((resolve) => setTimeout(resolve, 400));
  assertEquals(heard.arrived.length, before, "a freeze that wrote nothing still announced");

  const [row] = await database.queryOrThrow<{ frozen_reason: string }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assertEquals(row.frozen_reason, "closed", "the second freeze overwrote the first reason");
  await heard.close();
});

// A rolled-back freeze must not be announced: Postgres holds notifications
// until COMMIT for exactly this reason, and a listener told about a freeze that
// did not happen would tear down a live person's sockets.
Deno.test("a freeze that is rolled back is never announced", async () => {
  const sessionId = await makeSession();
  const heard = listener();
  await heard.ready;

  await database.transaction(async (run) => {
    await freezeSession(run, sessionId, "pin_limit");
    throw new Error("deliberate rollback");
  }).catch(() => {});

  assert(await heard.quiet(), `a rolled-back freeze was announced: ${heard.arrived}`);
  const [row] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [sessionId],
  );
  assertEquals(row.frozen_at, null, "a rolled-back freeze reached the table");
  await heard.close();
});

// No pool-closing case: this suite's connections are opened by the pool before
// the first test runs, and Deno's leak checker calls closing them inside a test
// a leak. The process ends when the suite does, and the throwaway Postgres goes
// with it.
addEventListener("unload", () => {
  database.closePool();
});
