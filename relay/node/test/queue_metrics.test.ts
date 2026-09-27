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

// ── Watchdog С6: the oldest phrase waiting for a verdict, by face ──
//
// Each case on a face of its own, so phrases other suites leave waiting on
// the shared stand do not move these numbers.
function moderationAge(brand: string): number | null {
  const line = metrics.render().split("\n").find((row) =>
    row.startsWith(`relay_moderation_oldest_seconds{brand="${brand}"}`)
  );
  return line ? Number(line.split(" ").pop()) : null;
}

async function waitingPhrase(brand: string, ageSeconds: number, nameState = "accepted"): Promise<string> {
  const author = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, name_state) VALUES ($1, 'п', 30, 'k', $2)`,
    [author, nameState],
  );
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, created_at)
     VALUES ($1, $2, $3, 'жду вердикта', 'alone', 'und', 59.93, 30.33, 1000, now() - make_interval(secs => $4))`,
    [id, brand, author, ageSeconds],
  );
  return id;
}

Deno.test("С6: the oldest waiting phrase reads as its age, and a verdict takes the series away", async () => {
  queue.forget();
  const brand = `c6-probe-${crypto.randomUUID()}`;
  const old = await waitingPhrase(brand, 240);
  await waitingPhrase(brand, 30);
  await queue.collectQueueMetrics();
  const age = moderationAge(brand);
  assert(age !== null && age >= 240 && age < 270, `the oldest waiting phrase read ${age} seconds`);

  // Published: the oldest is the other one now.
  await database.queryOrThrow(`UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '3 hours' WHERE id = $1`, [old]);
  await queue.collectQueueMetrics();
  const next = moderationAge(brand);
  assert(next !== null && next >= 30 && next < 60, `after one verdict the oldest read ${next} seconds`);

  // Nothing waiting: no series, not a nought that reads as "arrived now".
  await database.queryOrThrow(`UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '3 hours' WHERE brand = $1 AND visible_at IS NULL`, [brand]);
  await queue.collectQueueMetrics();
  assertEquals(moderationAge(brand), null, "an empty queue still reports an age");
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE brand = $1`, [brand]);
});

Deno.test("С6: a phrase held by its author's refused name is not the node's queue", async () => {
  queue.forget();
  const brand = `c6-probe-${crypto.randomUUID()}`;
  // Two hours: the sweep keeps it (lib/feed_verdict.ts sweepStaleQueue), and
  // counted here it would read as a queue stopped since morning.
  await waitingPhrase(brand, 7200, "rejected");
  await queue.collectQueueMetrics();
  assertEquals(moderationAge(brand), null, "a phrase waiting on its author was counted as waiting on the node");
  await waitingPhrase(brand, 60);
  await queue.collectQueueMetrics();
  const age = moderationAge(brand);
  assert(age !== null && age >= 60 && age < 90, `with the refused one beside it the queue read ${age} seconds`);
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE brand = $1`, [brand]);
});

// ── Watchdog С6's letter (lib/moderation_watch.ts): a stop is news once ──
//
// Read the way the gauge reads the queue, from the stand's database; each case
// on a face of its own, and the letters a function the case holds.
const { watchModeration, forgetModerationWatch, STOPPED_SECONDS } = await import("../src/lib/moderation_watch.ts");

type Letter = { to: string; brand: string; oldestMinutes: number; waiting: number; pastNineInADay: number };

// Letters for one face only; `ok` says whether they were sent.
function letters(brand: string, ok = true) {
  const sent: Letter[] = [];
  return {
    sent,
    send: (to: string, q: Omit<Letter, "to">) => {
      if (q.brand === brand) sent.push({ to, ...q });
      return Promise.resolve(ok);
    },
  };
}

const face = () => `c6-watch-${crypto.randomUUID()}`;
const TO = ["ops@example.test"];
const HOUR = 3_600_000;
// What the sweep does to a phrase nobody decided: the row goes, no verdict.
const sweep = (brand: string) => database.queryOrThrow(`DELETE FROM feed_messages WHERE brand = $1 AND visible_at IS NULL`, [brand]);
const publish = (id: string) =>
  database.queryOrThrow(
    `UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '3 hours' WHERE id = $1`,
    [id],
  );

Deno.test("a stopped queue writes one letter, with the face, the age, the count and the day's late ones", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await waitingPhrase(brand, 30);
  await watchModeration({ send: l.send, to: TO });
  assertEquals(l.sent, [{ to: "ops@example.test", brand, oldestMinutes: 9, waiting: 2, pastNineInADay: 1 }], "the stop was not told as it is");
  await sweep(brand);
});

Deno.test("a queue still stopped on the next passes writes nothing more", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  const start = Date.now();
  for (const minutes of [0, 1, 2]) await watchModeration({ now: start + minutes * 60_000, send: l.send, to: TO });
  assertEquals(l.sent.length, 1, `one stop wrote ${l.sent.length} letters`);
  await sweep(brand);
});

Deno.test("with no moderator, phrases that age out one after another write one letter a day", async () => {
  // Every phrase ages to the ceiling and the sweep takes it: the queue empties
  // every ten minutes, and an empty queue is not one that came alive.
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  const start = Date.now();
  for (let i = 0; i < 5; i++) {
    await waitingPhrase(brand, STOPPED_SECONDS + 20);
    await watchModeration({ now: start + i * 10 * 60_000, send: l.send, to: TO });
    await sweep(brand);
    await watchModeration({ now: start + i * 10 * 60_000 + 60_000, send: l.send, to: TO });
  }
  assertEquals(l.sent.length, 1, `five stalls wrote ${l.sent.length} letters`);
  assertEquals(l.sent[0].pastNineInADay, 1);
  // And over the rest of the day, a stall every seventy minutes with no
  // verdict: past the hour's brake each time, so only the day holds them —
  // without it, a letter an hour (observer, 2026-09-26).
  for (let i = 1; i <= 19; i++) {
    await waitingPhrase(brand, STOPPED_SECONDS + 20);
    await watchModeration({ now: start + i * 70 * 60_000, send: l.send, to: TO });
    await sweep(brand);
  }
  assertEquals(l.sent.length, 1, `a day of stalls an hour apart wrote ${l.sent.length} letters`);
  // A day on, still stalling: the next letter, with the day's count.
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start + 25 * HOUR, send: l.send, to: TO });
  assertEquals(l.sent.length, 2, "a queue still stopping a day later was not told again");
  await sweep(brand);
});

Deno.test("a verdict, then a stop again: a second letter, but not within the hour", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  const start = Date.now();
  const first = await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start, send: l.send, to: TO });
  assertEquals(l.sent.length, 1);
  // The moderator decides one — and the queue stops again.
  await publish(first);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start + 20 * 60_000, send: l.send, to: TO });
  assertEquals(l.sent.length, 1, "a flap inside the hour wrote a second letter");
  await watchModeration({ now: start + HOUR + 60_000, send: l.send, to: TO });
  assertEquals(l.sent.length, 2, "a stop after a verdict was not told");
  await sweep(brand);
});

Deno.test("a moderator who decides only tables, or only refuses, is not a stopped one (db/078)", async () => {
  const { noteVerdict } = await import("../src/lib/moderation_watch.ts");
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  const start = Date.now();
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start, send: l.send, to: TO });
  assertEquals(l.sent.length, 1);
  // No phrase published: a table line decided, as /admin/table-queue notes it.
  await noteVerdict(brand);
  await sweep(brand);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start + HOUR + 60_000, send: l.send, to: TO });
  assertEquals(l.sent.length, 2, "a decision at a table was not read as the moderator being there");
  await sweep(brand);
  await database.queryOrThrow(`DELETE FROM moderation_verdicts WHERE brand = $1`, [brand]);
});

Deno.test("a verdict on another face does not bring this one's queue back", async () => {
  forgetModerationWatch();
  const brand = face();
  const other = face();
  const l = letters(brand);
  const start = Date.now();
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  await watchModeration({ now: start, send: l.send, to: TO });
  const theirs = await waitingPhrase(other, 30);
  await publish(theirs);
  await watchModeration({ now: start + 2 * HOUR, send: l.send, to: TO });
  assertEquals(l.sent.length, 1, "a verdict on another face was read as this face's queue moving");
  await sweep(brand);
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE brand = $1`, [other]);
});

Deno.test("a phrase held by its author's refused name does not wake anybody", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  // An hour: it waits on its author, not on the node (§8.2).
  await waitingPhrase(brand, 3600, "rejected");
  const pass = await watchModeration({ send: l.send, to: TO });
  assertEquals(l.sent, [], "a phrase waiting on its author was told as a stopped queue");
  assert(!pass.stopped.includes(brand), "the face was called stopped");
  await sweep(brand);
});

Deno.test("a queue under nine minutes is slow, not stopped", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  await waitingPhrase(brand, STOPPED_SECONDS - 30);
  await watchModeration({ send: l.send, to: TO });
  assertEquals(l.sent, [], "eight and a half minutes was told as a stop");
  await sweep(brand);
});

Deno.test("a letter that did not leave is tried again after a pause that grows, not every minute", async () => {
  // Review panel F13: with the mail down it used to try, and log an error,
  // every minute for as long as the queue stayed stopped.
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand, false);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  const start = Date.now();
  const at = (seconds: number) => watchModeration({ now: start + seconds * 1000, send: l.send, to: TO });
  await at(0);
  await at(30);
  assertEquals(l.sent.length, 1, "a failed letter was tried again inside its first minute");
  await at(61);
  assertEquals(l.sent.length, 2, "a failed letter was not tried again after a minute");
  await at(61 + 90);
  assertEquals(l.sent.length, 2, "the second pause did not grow past a minute");
  await at(61 + 121);
  assertEquals(l.sent.length, 3, "a failed letter was not tried again after two minutes");
  assertEquals(l.sent.every((x) => x.brand === brand), true);
  await sweep(brand);
});

Deno.test("a node with nobody to write to says so once, not every minute", async () => {
  forgetModerationWatch();
  const brand = face();
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  const start = Date.now();
  const said: Array<string | null> = [];
  for (const minute of [0, 1, 2, 3]) {
    const pass = await watchModeration({ now: start + minute * 60_000, to: [] });
    said.push(pass.noRoad);
    assertEquals(pass.attempts, 0, "a letter was attempted with no address to send it to");
  }
  assertEquals(said, ["DSA_ESCALATION_EMAILS names nobody", null, null, null], "no address was said more than once");
  await sweep(brand);
});

Deno.test("mail switched off is said once, and nothing is sent", async () => {
  forgetModerationWatch();
  const brand = face();
  const l = letters(brand);
  await waitingPhrase(brand, STOPPED_SECONDS + 20);
  const start = Date.now();
  const first = await watchModeration({ now: start, send: l.send, to: TO, transport: "none" });
  const second = await watchModeration({ now: start + 60_000, send: l.send, to: TO, transport: "none" });
  assertEquals([first.noRoad, second.noRoad], ["mail transport is none", null], "mail switched off was said more than once");
  assertEquals(l.sent, [], "a letter went out with the mail switched off");
  await sweep(brand);
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
