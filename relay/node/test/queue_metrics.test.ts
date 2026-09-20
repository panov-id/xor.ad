// The queue, as a scrape sees it.
//
// Every number here exists because of one failure shape, described at the top
// of lib/queue_metrics.ts: a job that exhausts its attempts becomes a tombstone
// and never re-arms itself, so the work stops for good while nothing anywhere
// changes. Depth alone does not catch it — a queue with no rows and a queue
// whose only row is a tombstone both look idle.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const metrics = await import("../src/lib/metrics.ts");
const queue = await import("../src/lib/queue_metrics.ts");

await database.queryOrThrow("SELECT 1");

const KIND = `metrics-probe-${crypto.randomUUID()}`;

async function clean() {
  await database.queryOrThrow(`DELETE FROM jobs WHERE kind LIKE 'metrics-probe-%'`);
  queue.forget();
}

// One series out of the rendered text, by name and kind label.
function seriesFor(name: string, kind: string): number | null {
  const line = metrics.render().split("\n").find((row) =>
    row.startsWith(`${name}{kind="${kind}"}`)
  );
  return line ? Number(line.split(" ").pop()) : null;
}

Deno.test("a standing job reads as one, and its age is how overdue it is", async () => {
  await clean();
  // One row, not two: `jobs_standing` (db/020) is a unique index admitting at
  // most one non-tombstone job per kind, which is why this is `standing` and
  // not a depth — measured here, against the real schema, rather than assumed.
  await database.queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at) VALUES ($1, '{}'::jsonb, now() - interval '90 seconds')`,
    [KIND],
  );
  await queue.collectQueueMetrics();

  assertEquals(seriesFor("relay_jobs_standing", KIND), 1);
  const age = seriesFor("relay_jobs_oldest_due_seconds", KIND);
  assert(age !== null && age >= 90 && age < 120, `the standing job was ${age} seconds overdue`);
  assertEquals(seriesFor("relay_jobs_tombstones", KIND), 0);
  await clean();
});

Deno.test("a kind with a tombstone and nothing standing is a chain that died", async () => {
  await clean();
  // The shape the whole file exists for, and the only one that says the work
  // has stopped for good: a job that gave up, and no successor — because
  // enqueueOnce will not replace a tombstone and only a successful run re-arms.
  await database.queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at, locked_until)
     VALUES ($1, '{}'::jsonb, now() - interval '3 days', 'infinity')`,
    [KIND],
  );
  await queue.collectQueueMetrics();

  assertEquals(seriesFor("relay_jobs_standing", KIND), 0, "a dead chain still reads as standing");
  assertEquals(seriesFor("relay_jobs_tombstones", KIND), 1);
  await clean();
});

Deno.test("a job due tomorrow has no age, and nothing pretends it is nought", async () => {
  await clean();
  await database.queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at) VALUES ($1, '{}'::jsonb, now() + interval '1 day')`,
    [KIND],
  );
  await queue.collectQueueMetrics();

  assertEquals(seriesFor("relay_jobs_standing", KIND), 1);
  // Not zero: "nothing is due" and "something came due this instant" are
  // different facts, and an alert on the second must not fire on the first.
  assertEquals(seriesFor("relay_jobs_oldest_due_seconds", KIND), null);
  await clean();
});

Deno.test("a tombstone is counted apart, and does not count as waiting", async () => {
  await clean();
  // What lib/jobs.ts leaves behind when a job gives up: locked for ever, kept
  // as the only evidence it ever failed. This is the number that catches a
  // sweeper that stopped running weeks ago.
  await database.queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at, locked_until)
     VALUES ($1, '{}'::jsonb, now() - interval '30 days', 'infinity')`,
    [KIND],
  );
  await queue.collectQueueMetrics();

  assertEquals(seriesFor("relay_jobs_tombstones", KIND), 1);
  assertEquals(seriesFor("relay_jobs_standing", KIND), 0, "a tombstone was counted as standing");
  assertEquals(
    seriesFor("relay_jobs_oldest_due_seconds", KIND),
    null,
    "a tombstone was counted as a job overdue by thirty days",
  );
  await clean();
});

Deno.test("a queue that drains stops reporting its old depth", async () => {
  await clean();
  await database.queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at) VALUES ($1, '{}'::jsonb, now())`,
    [KIND],
  );
  await queue.collectQueueMetrics();
  assertEquals(seriesFor("relay_jobs_standing", KIND), 1);

  // A gauge nobody writes keeps its last value until the process restarts,
  // which is how a drained queue goes on looking full for days.
  await database.queryOrThrow(`DELETE FROM jobs WHERE kind = $1`, [KIND]);
  await queue.collectQueueMetrics();
  assertEquals(seriesFor("relay_jobs_standing", KIND), null, "the drained queue still reads full");
  await clean();
});

addEventListener("unload", () => {
  database.closePool();
});
