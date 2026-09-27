// Watchdog С6's letter: the moderation queue has stopped (docs/watchdogs_RU.md).
//
// The gauge relay_moderation_oldest_seconds and the rule ModerationQueueStopped
// went in first, and on the boxes they reach nobody: the boxes run no
// Alertmanager. С7 met the same wall and answered it with a letter from the
// node itself (lib/backup_watch.ts); this is that answer for С6.
//
// Every minute the node reads the queue the gauge reads — MODERATION_WAITING
// in lib/queue_metrics.ts, so the two cannot disagree about what "waiting" is —
// and a face whose oldest phrase has waited longer than nine minutes is a
// stopped queue: at ten the sweep drops the phrase unread, so an age there
// means nothing is being decided, not that it is slow.
//
// When a stop is news, and when it is not (coordinator, 2026-09-26, after the
// observer read the first version):
//
//   - An emptied queue is not a queue that came alive. Until the moderator of
//     §8.14 exists every phrase ages to the ceiling and the sweep takes it, so
//     "empty" happens every ten minutes and meant a letter every ten minutes —
//     the flood the alert was moved to `info` to avoid.
//   - Stops with no verdict between them: one letter a day per face, as С7.
//   - A verdict for that face after the last letter — one of its phrases
//     published — makes the next stop news again, but not sooner than an hour
//     after the last letter: a moderator
//     that works a minute and stops would otherwise write a letter per flap.
//     Decided by a quorum of three (A: a letter after a verdict, with a cap;
//     C: after a verdict, an hour apart; B: strictly one a day — outvoted,
//     it hides a new failure for up to a day).
//
// The letter carries one fact instead of a stream: how many phrases of that
// face waited past nine minutes in the last day, as this node saw them.
//
// Held in this process, as С7's once-a-day is: on a pool of N nodes the job
// runs on whichever node takes it, and each keeps its own memory. Named, not
// fixed here — the same open item as С7's, relay.watch.process.memory in
// docs/facts/open.tsv.

import { config } from "../config.ts";
import { query } from "./db.ts";
import { log } from "./log.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { sendModerationStopped } from "./mailer.ts";
import { MODERATION_WAITING, readModerationQueue } from "./queue_metrics.ts";
import { QUEUE_WAIT_MINUTES } from "./feed_verdict.ts";

// Nine of the ten: the rule's threshold in alerts.yml, for the same reason —
// at ten the sweep has already taken the evidence.
export const STOPPED_SECONDS = (QUEUE_WAIT_MINUTES - 1) * 60;
const A_DAY_MS = 24 * 60 * 60 * 1000;
const AN_HOUR_MS = 60 * 60 * 1000;

export type StoppedQueue = { brand: string; oldestMinutes: number; waiting: number; pastNineInADay: number };
type Send = (to: string, queue: StoppedQueue) => Promise<boolean>;

let lastLetterAt = new Map<string, number>();
// A letter that did not leave is tried again after a pause that doubles, from
// a minute to an hour, per face: a mail server that is down is not asked every
// minute for as long as it stays down (review panel F13, 2026-09-26).
let retry = new Map<string, { at: number; pause: number }>();
const FIRST_PAUSE_MS = 60 * 1000;
// The road that is not there is said once per process, not once a minute.
let saidNoRoad: string | null = null;
// Phrases seen past nine minutes, by face, with when first seen — the day's count.
let pastNine = new Map<string, Map<string, number>>();

// Tests only: what this process was told outlives a suite otherwise.
export function forgetModerationWatch(): void {
  lastLetterAt = new Map();
  pastNine = new Map();
  retry = new Map();
  saidNoRoad = null;
}

// A moderator decided something for this face: a phrase or a table line or a
// table's name, published or refused (db/078). Called by the panel's queues
// after a decision applied. A failed write is logged and not thrown: the
// decision itself stands, and the cost is a stopped-queue letter too many.
export async function noteVerdict(brand: string | null): Promise<void> {
  if (!brand) return;
  const done = await query(
    `INSERT INTO moderation_verdicts (brand, decided_at) VALUES ($1, now())
       ON CONFLICT (brand) DO UPDATE SET decided_at = greatest(moderation_verdicts.decided_at, EXCLUDED.decided_at)`,
    [brand],
  );
  if (done === null) log("warn", "a moderation verdict was not noted", { brand });
}

// A verdict for this face since `at`: a decision the panel noted (noteVerdict),
// or one of its phrases published, which stamps visible_at. By the face and not
// anywhere (observer, 2026-09-26): a verdict on one face does not bring
// another's stopped queue back. Until db/078 a refusal did not count — it
// deletes the row — and neither did a decision at a table, so a moderator that
// only refused, or only decided tables, read as stopped.
async function verdictSince(brand: string, at: number): Promise<boolean> {
  const rows = await query<{ any: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM moderation_verdicts WHERE brand = $1 AND decided_at > $2)
         OR EXISTS (SELECT 1 FROM feed_messages WHERE brand = $1 AND visible_at > $2) AS any`,
    [brand, new Date(at)],
  );
  return rows?.[0]?.any === true;
}

export async function watchModeration(options: {
  now?: number;
  send?: Send;
  to?: string[];
  transport?: string;
} = {}): Promise<{ stopped: string[]; letters: string[]; attempts: number; noRoad: string | null }> {
  const now = options.now ?? Date.now();
  const rows = await readModerationQueue();
  // Could not look: nothing learned, and nothing told or forgotten.
  if (rows === null) return { stopped: [], letters: [], attempts: 0, noRoad: null };

  const late = await query<{ id: string; brand: string }>(
    `SELECT f.id, f.brand FROM feed_messages f
      WHERE ${MODERATION_WAITING}
        AND f.created_at < now() - make_interval(secs => $1)`,
    [STOPPED_SECONDS],
  );
  for (const row of late ?? []) {
    const seen = pastNine.get(row.brand) ?? new Map<string, number>();
    if (!seen.has(row.id)) seen.set(row.id, now);
    pastNine.set(row.brand, seen);
  }
  for (const seen of pastNine.values()) {
    for (const [id, at] of seen) if (now - at > A_DAY_MS) seen.delete(id);
  }

  const stopped = rows.filter((row) => row.oldestSeconds > STOPPED_SECONDS);
  const result = { stopped: stopped.map((row) => row.brand), letters: [] as string[], attempts: 0, noRoad: null as string | null };

  // No road for a letter at all — mail switched off, or nobody to write to —
  // is a fact about this node's configuration, not about the queue. Said once,
  // with the stop that met it, and then left alone: a line a minute said the
  // same thing sixty times an hour (review panel F13).
  const addresses = options.to ?? escalationAddresses();
  const noRoad = (options.transport ?? config.mail.transport) === "none"
    ? "mail transport is none"
    : addresses.length === 0 ? "DSA_ESCALATION_EMAILS names nobody" : null;
  if (noRoad) {
    if (stopped.length > 0 && saidNoRoad !== noRoad) {
      saidNoRoad = noRoad;
      result.noRoad = noRoad;
      log("warn", "the moderation queue stopped, and this node has no road for the letter", {
        why: noRoad,
        brands: result.stopped,
      });
    }
    return result;
  }
  saidNoRoad = null;

  const send = options.send ?? sendModerationStopped;
  for (const row of stopped) {
    const last = lastLetterAt.get(row.brand);
    const news = last === undefined ||
      now - last >= A_DAY_MS ||
      (now - last >= AN_HOUR_MS && await verdictSince(row.brand, last));
    if (!news) continue;
    const waiting = retry.get(row.brand);
    if (waiting && now < waiting.at) continue;
    const queue = {
      brand: row.brand,
      oldestMinutes: Math.floor(row.oldestSeconds / 60),
      waiting: row.waiting,
      pastNineInADay: pastNine.get(row.brand)?.size ?? 0,
    };
    let sent = false;
    result.attempts++;
    for (const address of addresses) {
      if (await send(address, queue)) sent = true;
    }
    if (sent) {
      lastLetterAt.set(row.brand, now);
      retry.delete(row.brand);
      result.letters.push(row.brand);
    } else {
      const pause = Math.min(waiting ? waiting.pause * 2 : FIRST_PAUSE_MS, AN_HOUR_MS);
      retry.set(row.brand, { at: now + pause, pause });
    }
    log(sent ? "warn" : "error", sent ? "told people the moderation queue stopped" : "the moderation queue stopped and nobody could be told", {
      brand: row.brand,
      oldest_minutes: queue.oldestMinutes,
      waiting: row.waiting,
      past_nine_in_a_day: queue.pastNineInADay,
      ...(sent ? {} : { next_try_in_seconds: Math.round(retry.get(row.brand)!.pause / 1000) }),
    });
  }
  return result;
}
