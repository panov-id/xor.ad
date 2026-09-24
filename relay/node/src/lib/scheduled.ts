// What the queue is for, so far: keeping the page-view objects inside their
// retention window without anyone remembering to.
//
// A job re-arms itself by RETURNING tomorrow's time, so the schedule lives in the
// same table as the work and needs no second mechanism to stay in step with it. A
// node that never comes back leaves the row claimable by whichever one does.
//
// It returns rather than enqueues, and that is not a style choice: enqueueing
// happens while the handler's own row is still in the table, `jobs_standing`
// (db/020) refuses the second standing job of that kind, and `enqueue` swallows
// the refusal. The chain then died after one successful pass, with no error
// anywhere — found by a review panel on 2026-09-08 and reproduced against a live
// Postgres before this was changed.

import { sendSupportDigests, sweepSupport } from "./support_sweeper.ts";
import { enqueueOnce, handle } from "./jobs.ts";
import { enabled as databaseEnabled, queryOrThrow } from "./db.ts";
import { log } from "./log.ts";
import { prunePageviews } from "../../tools/prune_pageviews.ts";
import { pruneObjects } from "../../tools/prune_objects.ts";
import { pruneDsaRecords } from "../../tools/prune_dsa_records.ts";
import { pruneMagicLinks } from "./auth.ts";
import { sweepIdentities } from "./identity_sweeper.ts";
import { watchNoticeAge } from "./dsa_watchdog.ts";
import { reportTombstones } from "./tombstone_watch.ts";
import { DSA_NOTICE_NOTIFY, retryArrivalLetters, sendNightPathSummaries } from "./notice_notify.ts";
import { sweepExpiredMatches } from "./match_sweeper.ts";
import { sweepExpiredPending } from "./pending_sweeper.ts";
import { sweepChats } from "./chat_sweeper.ts";
import { wakeReturned } from "./away_waker.ts";
import { watchBackup } from "./backup_watch.ts";
import { sweepExpiredPhrases, sweepStaleQueue } from "./feed_verdict.ts";
import { countActiveRecipients } from "./dsa_recipients.ts";

export const PRUNE_PAGEVIEWS = "prune_pageviews";
// Everything else the policy promises a window for. Page views keep their own job
// because their window is argued separately.
export const PRUNE_OBJECTS = "prune_objects";
// Notices under Article 16 and the statements of reasons that answer them.
// The window is a year, and it is promised in the privacy policy — which makes
// forgetting to run this a broken promise rather than untidiness.
export const PRUNE_DSA = "prune_dsa_records";
// Article 24(3): the month's count of active recipients, raised daily (db/053).
export const COUNT_DSA_RECIPIENTS = "count_dsa_recipients";
// Idempotency rows outlive their purpose by a lot: a key exists so a retry a few
// minutes later gets the same answer, and after a day nobody will ever look one
// up again. Nothing deleted them until 2026-09-08, so the table only grew — one
// row with a whole response in it per unique keyed request.
export const PRUNE_IDEMPOTENCY = "prune_idempotency";
// Sign-in links that were never clicked. Written by every request to
// /auth/request-link and deleted only by a redemption, so an unclicked one — a
// mistyped address, a change of mind, every request in a flood — stayed for
// ever, holding an operator's email address in clear.
export const PRUNE_MAGIC = "prune_magic_links";
// Invitations to move an identity to another device, and the one-shot nonces of
// protocol §2. Both tables were built with an index "for the sweeper" and both
// sweepers were missing — db/024 says "the sweeper reads by expiry; without this
// it reads the whole table hourly", db/022 says "swept by nonce.ttl, by the same
// janitor that sweeps conversations", and neither janitor existed. Found by the
// data lens of the review panel, 2026-09-21.
//
// For nonces that is only growth. For invitations it is worse: `lookup_id` is
// the primary key and comes from the client, so a row that is never deleted
// reserves that code for ever, and an honest invitation can collide with one
// from a year ago.
export const PRUNE_INVITES = "prune_session_invites";
export const PRUNE_NONCES = "prune_nonces";
// Jobs that gave up. Kept as evidence, but not for ever: nothing removed them,
// and the standing-job index deliberately ignores them, so one kind could hold
// any number. Found by a review lens, 2026-09-08.
// The three deadlines of an identity (§8.2): an abandoned signup after an hour,
// a year without a session, and thirty days after closing. `identity.sweeper` is
// the name docs/facts/limits.tsv gives as their enforcer, and until 2026-09-20
// the name pointed at nothing at all.
export const SWEEP_IDENTITIES = "sweep_identities";
// Support requests past their year (chat spec §13; support.retention).
export const SWEEP_SUPPORT = "sweep_support";
// Watchdog С1 (docs/watchdogs_RU.md): notices under Article 16 that nobody has
// answered. The letter about a new notice goes once, and nothing watched what
// happened next — so a missed letter meant a deadline running out in silence.
export const DSA_NOTICE_AGE = "dsa_notice_age";
// Phrases that waited past `moderation.queue.wait` without a verdict. §8.3:
// such a row is deleted and does not count as queued — so the author's slot
// frees and their pause does not grow because the node was slow.
export const SWEEP_FEED_QUEUE = "sweep_feed_queue";
// Phrases whose four hours and twenty minutes ran out. Separate from the queue
// sweep above: that one is a verdict that never came, this one a life that
// ended, and one job reporting both would report one number for two unrelated
// facts.
export const SWEEP_FEED_EXPIRED = "sweep_feed_expired";
// Matches whose term ran out, with their snapshots of other people's phrases
// (§8.5). Every minute, like the phrases they were made of: a snapshot that
// outlives the phrase by an hour is text nobody may read for an hour.
export const SWEEP_MATCHES = "sweep_matches";
// Queued chat messages past chat.pending.ttl (§8.8). Every minute: the term is
// counted in minutes and the rows are ciphertext held for someone else.
export const SWEEP_PENDING = "sweep_pending";
// Conversations whose term came, and those over for both (§8.10). Every minute:
// the shortest term is ten.
export const SWEEP_CHATS = "sweep_chats";
// Times away that ran out by themselves, their held rooms woken (db/047).
// Every minute: a longer wait is a longer silence in an open conversation.
export const WAKE_RETURNED = "wake_returned";
// Watchdog С7: the age of the last nightly dump, hourly (lib/backup_watch.ts).
export const WATCH_BACKUP = "watch_backup";
export const PRUNE_TOMBSTONES = "prune_job_tombstones";
const TOMBSTONE_DAYS = 30;
const IDEMPOTENCY_DAYS = 1;
// Big enough that an ordinary night is one batch, small enough that the lock a
// batch holds is not worth noticing.
const IDEMPOTENCY_BATCH = 5000;
// A pass deletes at most this many batches and then waits for tomorrow rather
// than running for an hour on the first night. Twenty-five million rows is well
// past anything this table can honestly reach in a day.
const IDEMPOTENCY_BATCHES = 5000;

// The same shape for the two tables that had no sweeper at all: batched, so the
// first run after a busy stretch is not one transaction holding a lock per row
// (the reason written out at PRUNE_IDEMPOTENCY below). Smaller batches because
// these tables are small by design — an invitation lives two minutes and a
// nonce ten, so anything found here is a backlog, not a population.
const INVITE_BATCH = 2000;
const INVITE_BATCHES = 500;

// From docs/facts/limits.tsv (nonce.ttl): §2 refuses a nonce older than this on
// its own, so a row past it decides nothing.
const NONCE_TTL_MINUTES = 10;
const A_DAY_MS = 24 * 60 * 60 * 1000;
const A_MINUTE_MS = 60 * 1000;
const A_HOUR_MS = 60 * A_MINUTE_MS;

export function registerScheduledJobs(): void {
  handle(PRUNE_OBJECTS, async (payload) => {
    const result = await pruneObjects({ apply: true, only: payload.only as string | undefined });
    log("info", "pruned stored objects", { ...result, skipped: result.skipped.join(",") });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(COUNT_DSA_RECIPIENTS, async () => {
    const active = await countActiveRecipients();
    if (active === null) throw new Error("could not count the month's active recipients");
    log("info", "counted the month's active recipients", { active });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_DSA, async () => {
    const result = await pruneDsaRecords({ apply: true });
    log("info", "pruned DSA records", { ...result });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_IDEMPOTENCY, async () => {
    // In batches, not one statement. The table this sweeps is the one that had
    // grown without a ceiling, so the very first run on a busy node is the
    // largest delete it will ever do — one transaction holding a row lock per
    // row, bloating the table, and outliving the ten-minute lease so another
    // node claims the job while it is still running. Found by a review lens,
    // 2026-09-08. Each batch commits on its own, so an interruption keeps the
    // work already done.
    let deleted = 0;
    for (let batch = 0; batch < IDEMPOTENCY_BATCHES; batch++) {
      const rows = await queryOrThrow<{ count: string }>(
        `WITH doomed AS (
           SELECT key FROM idempotency
            WHERE created_at < now() - interval '${IDEMPOTENCY_DAYS} days'
            LIMIT ${IDEMPOTENCY_BATCH}
         ), gone AS (
           DELETE FROM idempotency WHERE key IN (SELECT key FROM doomed) RETURNING 1
         )
         SELECT count(*)::text AS count FROM gone`,
      );
      const went = Number(rows[0]?.count ?? 0);
      deleted += went;
      if (went < IDEMPOTENCY_BATCH) break;
    }
    log("info", "pruned idempotency keys", { deleted });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_TOMBSTONES, async () => {
    // A job that ran out of attempts stays as `locked_until = 'infinity'`, on
    // purpose: it is the only record that something never worked, and deleting
    // it would erase the evidence (db/001, jobs.ts). But the partial index
    // excludes tombstones, so there is no ceiling on how many of one kind can
    // pile up, and nothing ever removed them. A month is long enough that
    // anybody who was going to look has looked.
    const rows = await queryOrThrow<{ count: string }>(
      `WITH gone AS (
         DELETE FROM jobs
          WHERE locked_until = 'infinity'
            AND run_at < now() - interval '${TOMBSTONE_DAYS} days'
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM gone`,
    );
    const deleted = Number(rows[0]?.count ?? 0);
    // Only worth a line when there was something to say: a nightly "deleted: 0"
    // is how a log stops being read.
    if (deleted > 0) log("info", "pruned job tombstones", { deleted });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(SWEEP_FEED_EXPIRED, async () => {
    // Every minute as well: the feed already stops delivering an expired phrase
    // the moment its term passes, so this is about the table rather than about
    // what people see — but a table that only shrinks once an hour is a table
    // that holds text nobody may read for an hour.
    await sweepExpiredPhrases();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(SWEEP_CHATS, async () => {
    await sweepChats();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(WAKE_RETURNED, async () => {
    await wakeReturned();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(WATCH_BACKUP, async () => {
    await watchBackup();
    return new Date(Date.now() + A_HOUR_MS);
  });

  handle(SWEEP_PENDING, async () => {
    await sweepExpiredPending();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(SWEEP_MATCHES, async () => {
    await sweepExpiredMatches();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(SWEEP_FEED_QUEUE, async () => {
    // Every minute, because the deadline it enforces is ten: a pass an hour
    // would make "ten minutes" mean "up to seventy".
    await sweepStaleQueue();
    return new Date(Date.now() + A_MINUTE_MS);
  });

  handle(SWEEP_SUPPORT, async () => {
    // The year first, then the day's digest: a request that just left its year
    // is not counted as waiting.
    await sweepSupport();
    await sendSupportDigests();
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(SWEEP_IDENTITIES, async () => {
    // Hourly, not daily: the shortest of the three deadlines is an hour, and a
    // once-a-night pass would hold abandoned signups for a day at worst — rows
    // that §8.2 says pass no membership check and exist only to be swept.
    await sweepIdentities();
    return new Date(Date.now() + A_HOUR_MS);
  });

  // An expired invitation is kept an hour past its expiry, long enough for the
  // device that was showing the code to ask what happened to it and be told
  // "expired" rather than "no such code" — stateOf() in routes/transfer.ts
  // draws that distinction and it is worth something to the person holding a
  // dead screen. Decided invitations go by the same clock: the decision has
  // already reached both sides.
  handle(PRUNE_INVITES, async () => {
    let deleted = 0;
    for (let batch = 0; batch < INVITE_BATCHES; batch++) {
      const rows = await queryOrThrow<{ count: string }>(
        `WITH doomed AS (
           SELECT lookup_id FROM session_invites
            WHERE expires_at < now() - interval '1 hour'
            LIMIT ${INVITE_BATCH}
         ), gone AS (
           DELETE FROM session_invites
            WHERE lookup_id IN (SELECT lookup_id FROM doomed) RETURNING 1
         )
         SELECT count(*)::text AS count FROM gone`,
      );
      const went = Number(rows[0]?.count ?? 0);
      deleted += went;
      if (went < INVITE_BATCH) break;
    }
    log("info", "pruned session invites", { deleted });
    return new Date(Date.now() + A_HOUR_MS);
  });

  // A nonce is spent or it is not, and after nonce.ttl it can be neither: §2
  // refuses anything older than the window on its own, so a row past it decides
  // nothing and only takes room.
  handle(PRUNE_NONCES, async () => {
    let deleted = 0;
    for (let batch = 0; batch < INVITE_BATCHES; batch++) {
      const rows = await queryOrThrow<{ count: string }>(
        `WITH doomed AS (
           SELECT ctid FROM nonces
            WHERE created_at < now() - interval '${NONCE_TTL_MINUTES} minutes'
            LIMIT ${INVITE_BATCH}
         ), gone AS (
           DELETE FROM nonces WHERE ctid IN (SELECT ctid FROM doomed) RETURNING 1
         )
         SELECT count(*)::text AS count FROM gone`,
      );
      const went = Number(rows[0]?.count ?? 0);
      deleted += went;
      if (went < INVITE_BATCH) break;
    }
    log("info", "pruned nonces", { deleted });
    return new Date(Date.now() + A_HOUR_MS);
  });

  // Watchdog С2: arrival letters that did not leave, every ten minutes.
  handle(DSA_NOTICE_NOTIFY, async () => {
    await retryArrivalLetters();
    // And what the night path's ceiling held back, once its hour is over.
    await sendNightPathSummaries();
    return new Date(Date.now() + 10 * A_MINUTE_MS);
  });

  handle(DSA_NOTICE_AGE, async () => {
    const result = await watchNoticeAge();
    log("info", "watched the age of unresolved notices", { ...result });
    // Hourly after a pass that warned everyone. A letter that did not leave
    // brings the pass back in ten minutes rather than an hour, without
    // throwing: a throw spends the queue's attempts, and eight spent attempts
    // make a tombstone, and the chain waits for the hourly re-arm (watchdog С3).
    return new Date(Date.now() + (result.unsent ? 10 * A_MINUTE_MS : A_HOUR_MS));
  });

  handle(PRUNE_MAGIC, async () => {
    const result = await pruneMagicLinks();
    // Come straight back while there is more, rather than leaving the rest for
    // tomorrow: a backlog that only shrinks by one pass a day never shrinks.
    return new Date(Date.now() + (result.more ? A_MINUTE_MS : A_DAY_MS));
  });

  handle(PRUNE_PAGEVIEWS, async (payload) => {
    const days = typeof payload.days === "number" ? payload.days : undefined;
    const result = await prunePageviews({ days, apply: true });
    log("info", "pruned page views", { ...result });
    // Tomorrow's run is asked for only after this one succeeded. A failure
    // retries on the queue's own backoff instead of skipping a day.
    return new Date(Date.now() + A_DAY_MS);
  });
}

// Called once at start-up. `enqueueOnce` rather than `enqueue`: every node in
// the pool runs this line, and a standing intention does not want one copy per
// node.
// Watchdog С3, the re-arm half. armScheduledJobs() used to run once, at start:
// a start whose database did not answer armed nothing at all (enqueueOnce reads
// null and returns), and a job whose handler kept throwing ran out of its eight
// attempts and stayed a tombstone — both until somebody restarted the node. A
// database that is simply down spends no attempts: claim() reads null and takes
// nothing. It is the half-working one — answering the claim, failing the work —
// that makes tombstones. So the arming runs again every hour. Its own timer, not a job: a job can become a tombstone itself, or
// never be armed, and then nothing would re-arm the re-arm.
export async function rearmPass(): Promise<void> {
  await armScheduledJobs();
  await reportTombstones(PRUNE_DSA);
}

let rearming: ReturnType<typeof setInterval> | null = null;

export function startRearming(): void {
  // No database, no queue: a stand without Postgres behaves as it did.
  if (!databaseEnabled() || rearming !== null) return;
  rearming = setInterval(() => {
    rearmPass().catch((error) => log("error", "could not re-arm the scheduled jobs", { error: String(error) }));
  }, A_HOUR_MS);
  Deno.unrefTimer(rearming as unknown as number);
}

export async function armScheduledJobs(): Promise<void> {
  await enqueueOnce(PRUNE_PAGEVIEWS, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_OBJECTS, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_DSA, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(COUNT_DSA_RECIPIENTS, {}, new Date(Date.now() + A_HOUR_MS));
  await enqueueOnce(PRUNE_IDEMPOTENCY, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_MAGIC, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_INVITES, {}, new Date(Date.now() + A_HOUR_MS));
  await enqueueOnce(PRUNE_NONCES, {}, new Date(Date.now() + A_HOUR_MS));
  await enqueueOnce(PRUNE_TOMBSTONES, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(SWEEP_IDENTITIES, {}, new Date(Date.now() + A_HOUR_MS));
  await enqueueOnce(SWEEP_SUPPORT, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(DSA_NOTICE_AGE, {}, new Date(Date.now() + A_HOUR_MS));
  await enqueueOnce(DSA_NOTICE_NOTIFY, {}, new Date(Date.now() + 10 * A_MINUTE_MS));
  await enqueueOnce(SWEEP_FEED_QUEUE, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(SWEEP_FEED_EXPIRED, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(SWEEP_MATCHES, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(SWEEP_PENDING, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(SWEEP_CHATS, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(WAKE_RETURNED, {}, new Date(Date.now() + A_MINUTE_MS));
  await enqueueOnce(WATCH_BACKUP, {}, new Date(Date.now() + A_HOUR_MS));
}
