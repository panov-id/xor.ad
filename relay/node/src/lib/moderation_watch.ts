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
//   - A verdict given after the last letter — a phrase published or refused
//     anywhere; the moderator is one for all faces — makes the next stop news
//     again, but not sooner than an hour after the last letter: a moderator
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
// fixed here — the same open item as С7's.

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
// Phrases seen past nine minutes, by face, with when first seen — the day's count.
let pastNine = new Map<string, Map<string, number>>();

// Tests only: what this process was told outlives a suite otherwise.
export function forgetModerationWatch(): void {
  lastLetterAt = new Map();
  pastNine = new Map();
}

// A verdict anywhere since `at`: a publication stamps visible_at, a refusal
// deletes the row and leaves its moment in identity_stats.
async function verdictSince(at: number): Promise<boolean> {
  const rows = await query<{ any: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM feed_messages WHERE visible_at > $1)
         OR EXISTS (SELECT 1 FROM identity_stats s, unnest(s.rejected_at_recent) t WHERE t > $1) AS any`,
    [new Date(at)],
  );
  return rows?.[0]?.any === true;
}

export async function watchModeration(options: {
  now?: number;
  send?: Send;
  to?: string[];
} = {}): Promise<{ stopped: string[]; letters: string[] }> {
  const now = options.now ?? Date.now();
  const rows = await readModerationQueue();
  // Could not look: nothing learned, and nothing told or forgotten.
  if (rows === null) return { stopped: [], letters: [] };

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
  const send = options.send ?? sendModerationStopped;
  const letters: string[] = [];
  for (const row of stopped) {
    const last = lastLetterAt.get(row.brand);
    const news = last === undefined ||
      now - last >= A_DAY_MS ||
      (now - last >= AN_HOUR_MS && await verdictSince(last));
    if (!news) continue;
    const queue = {
      brand: row.brand,
      oldestMinutes: Math.floor(row.oldestSeconds / 60),
      waiting: row.waiting,
      pastNineInADay: pastNine.get(row.brand)?.size ?? 0,
    };
    let sent = false;
    for (const address of options.to ?? escalationAddresses()) {
      if (await send(address, queue)) sent = true;
    }
    if (sent) {
      lastLetterAt.set(row.brand, now);
      letters.push(row.brand);
    }
    log(sent ? "warn" : "error", sent ? "told people the moderation queue stopped" : "the moderation queue stopped and nobody could be told", {
      brand: row.brand,
      oldest_minutes: queue.oldestMinutes,
      waiting: row.waiting,
      past_nine_in_a_day: queue.pastNineInADay,
    });
  }
  return { stopped: stopped.map((row) => row.brand), letters };
}
