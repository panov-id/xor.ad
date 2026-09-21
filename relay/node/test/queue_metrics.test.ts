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

Deno.test("the brake gauges are read on the scrape, not when somebody knocks", async () => {
  // They used to be written inside the route handler, which meant the number
  // only moved when a request arrived. An attack that stopped at three in the
  // morning left the last value standing: the brake let go fifteen minutes
  // later and RecoveryBrakeOn kept firing until the first live request — that
  // is, until morning. Found by the operations lens of the review panel,
  // 2026-09-21.
  const brakes = await import("../src/lib/recovery_misses.ts");
  brakes.reset();

  // Nobody has knocked at all, and the gauge still has to be the truth.
  queue.collectBrakeMetrics();
  assertEquals(
    gaugeOf(metrics.render(), "relay_recovery_pause_seconds_left"),
    0,
    "an idle node did not publish a zero for the recovery brake",
  );

  // Fifty misses put the brake on for fifteen minutes.
  for (let i = 0; i < 50; i++) brakes.countMiss();
  queue.collectBrakeMetrics();
  const on = gaugeOf(metrics.render(), "relay_recovery_pause_seconds_left");
  assert(on > 0, `the brake was on and the gauge said ${on}`);

  // And it falls to nought by itself, with nobody knocking: the scrape reads
  // the clock rather than the last request.
  queue.collectBrakeMetrics(Date.now() + 16 * 60 * 1000);
  assertEquals(
    gaugeOf(metrics.render(), "relay_recovery_pause_seconds_left"),
    0,
    "the gauge stayed up after the pause had expired, with no request to move it",
  );
  brakes.reset();
});

// Read out of the exposition text, which is what Prometheus reads. A gauge with
// no labels still renders as `name value`, but the HELP and TYPE lines start
// with the same name, so the line has to be matched rather than the substring:
// the first attempt at this case parsed "# TYPE relay_..." and asserted on NaN.
function gaugeOf(rendered: string, name: string): number {
  for (const line of rendered.split("\n")) {
    if (line.startsWith("#")) continue;
    if (line.startsWith(name + " ") || line.startsWith(name + "{")) {
      return Number(line.slice(line.lastIndexOf(" ") + 1));
    }
  }
  return Number.NaN;
}
