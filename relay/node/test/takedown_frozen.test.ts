// The frozen-session branch of stillHere (open.tsv takedown.frozen.untested,
// W12-FZ). lib/take_down.ts stillHere is the second look a route takes after
// the wait on the counters row: the identity closed, the person away — and,
// since B75/B108, the session itself: frozen, or its vault share locked by the
// tenth PIN miss. The suites that drive the races (pin_limit_*, B108) lock the
// share and never set frozen_at, so the `s.frozen_at IS NULL` term had no test
// of its own. Here each term is held alone, with a second session of the same
// identity as the negative control: a freeze is per session, not per person.

import { assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const { stillHere } = await import("../src/lib/take_down.ts");
const { Freezes, freezeSession } = await import("../src/lib/sessions.ts");

await database.queryOrThrow("SELECT 1");
const pooled = { sanitizeOps: false, sanitizeResources: false };

async function person(): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
     VALUES ($1, 'takedown-frozen', 30, 'not-a-real-key', now())`,
    [id],
  );
  return id;
}

async function session(identity: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key)
       VALUES ($1, $2, 'not-a-real-key', 'not-a-real-key')`,
    [id, identity],
  );
  return id;
}

const ask = (me: string, sessionId: string) => database.transaction((run) => stillHere(run, me, sessionId));

Deno.test({
  name: "stillHere: a frozen session is closed for the route, the person's other session is not",
  ...pooled,
  async fn() {
    const me = await person();
    const device = await session(me);
    assertEquals(await ask(me, device), null, "a live session was not let through");

    const froze = await database.transaction((run) => freezeSession(run, device, "pin_limit", new Freezes()));
    assertEquals(froze, true, "the session was not frozen by this call");
    assertEquals(await ask(me, device), { closed: true, awayUntil: null }, "a frozen session was let through");
    // One live session per identity (sessions_one_live): the next device is
    // made after the freeze, and the freeze of the old one does not reach it.
    const next = await session(me);
    assertEquals(await ask(me, next), null, "a freeze of one session closed the person's next session");
    assertEquals(await ask(me, device), { closed: true, awayUntil: null }, "the frozen session came back with the next one");
  },
});

Deno.test({
  name: "stillHere: a session whose vault share is locked is closed as a frozen one is",
  ...pooled,
  async fn() {
    const me = await person();
    const device = await session(me);
    await database.queryOrThrow(
      `INSERT INTO vault_shares (session, auth_hash, share_enc, locked_at) VALUES ($1, 'hash', $2, now())`,
      [device, new Uint8Array(32)],
    );
    assertEquals(await ask(me, device), { closed: true, awayUntil: null }, "a locked share was let through");
  },
});

Deno.test({
  name: "stillHere: a session the node does not know is closed, and a closed identity closes every session",
  ...pooled,
  async fn() {
    const me = await person();
    const device = await session(me);
    assertEquals(await ask(me, crypto.randomUUID()), { closed: true, awayUntil: null }, "an unknown session was let through");
    await database.queryOrThrow(`UPDATE identities SET closed_at = now() WHERE id = $1`, [me]);
    assertEquals((await ask(me, device))?.closed, true, "a closed identity's live session was let through");
  },
});
