// Watchdog С3 against a real database: a job that gave up comes back within
// the hour, and a tombstone of prune_dsa_records is told to a person once.
import { assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("NODE_ENV_NAME", "test");

const { queryOrThrow } = await import("../src/lib/db.ts");
const { armScheduledJobs, rearmPass, PRUNE_DSA } = await import("../src/lib/scheduled.ts");
const { reportTombstones } = await import("../src/lib/tombstone_watch.ts");

await queryOrThrow("SELECT 1");
const pool = { sanitizeOps: false, sanitizeResources: false };

const standing = async (kind: string) =>
  (await queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM jobs WHERE kind = $1 AND locked_until IS DISTINCT FROM 'infinity'`,
    [kind],
  ))[0].n;

async function tombstone(kind: string): Promise<string> {
  await armScheduledJobs();
  const rows = await queryOrThrow<{ id: string }>(
    `UPDATE jobs SET locked_until = 'infinity', attempts = max_attempts
      WHERE kind = $1 AND locked_until IS DISTINCT FROM 'infinity'
      RETURNING id::text`,
    [kind],
  );
  assertEquals(rows.length, 1, "the job was not standing before it was made a tombstone");
  return rows[0].id;
}

Deno.test({ name: "a job that gave up is standing again after one pass", ...pool }, async () => {
  await tombstone(PRUNE_DSA);
  assertEquals(await standing(PRUNE_DSA), "0");
  Deno.env.set("DSA_ESCALATION_EMAILS", "ops@example.org");
  await rearmPass();
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(await standing(PRUNE_DSA), "1", "prune_dsa_records not re-armed after its tombstone");
});

Deno.test({ name: "a job that was never armed is armed by the pass", ...pool }, async () => {
  // The start whose database did not answer: enqueueOnce saw null and armed nothing.
  await queryOrThrow(`DELETE FROM jobs WHERE kind = 'sweep_chats'`);
  await rearmPass();
  assertEquals(await standing("sweep_chats"), "1", "a job missing since the start stayed missing");
});

Deno.test({ name: "a tombstone is told once, and again only if the letter did not leave", ...pool }, async () => {
  const id = await tombstone(PRUNE_DSA);
  Deno.env.set("DSA_ESCALATION_EMAILS", "ops@example.org");
  const letters: string[] = [];

  const failed = await reportTombstones(PRUNE_DSA, (_to, t) => {
    letters.push(t.id);
    return Promise.resolve(false);
  });
  assertEquals(failed.unsent >= 1, true);

  const told = await reportTombstones(PRUNE_DSA, (_to, t) => {
    letters.push(t.id);
    return Promise.resolve(true);
  });
  assertEquals(told.reported >= 1, true, "a letter that failed was not tried again");

  await reportTombstones(PRUNE_DSA, (_to, t) => {
    letters.push(t.id);
    return Promise.resolve(true);
  });
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(letters.filter((l) => l === id).length, 2, "one failed and one sent — no third letter about the same tombstone");
});

Deno.test({ name: "with nobody to tell, the tombstone stays unreported", ...pool }, async () => {
  const id = await tombstone(PRUNE_DSA);
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  const result = await reportTombstones(PRUNE_DSA, () => Promise.resolve(true));
  assertEquals(result.unsent >= 1, true);
  const [row] = await queryOrThrow<{ reported_at: Date | null }>(`SELECT reported_at FROM jobs WHERE id = $1`, [id]);
  assertEquals(row.reported_at, null, "a tombstone nobody heard about was marked as told");
});
