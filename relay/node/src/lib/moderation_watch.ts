// Watchdog С6's letter: the moderation queue has stopped (docs/watchdogs_RU.md).
//
// The gauge relay_moderation_oldest_seconds and the rule ModerationQueueStopped
// went in first, and on the boxes they reach nobody: the boxes run no
// Alertmanager. С7 met the same wall and answered it with a letter from the
// node itself (lib/backup_watch.ts); this is that answer for С6.
//
// Every minute the node reads the queue the gauge reads — the same query,
// readModerationQueue in lib/queue_metrics.ts, so the two cannot disagree about
// what "waiting" is — and a face whose oldest phrase has waited longer than
// nine minutes is a stopped queue: at ten the sweep drops the phrase unread,
// so an age there means nothing is being decided, not that it is slow.
//
// One letter per stop, not per pass (§С6 «Куда»). A face that was told stays
// told until its queue comes alive again — its oldest back under the
// threshold, or nothing waiting at all — and only a stop after that writes
// again. A letter nobody could be sent is tried on the next pass.
//
// Held in this process, as С7's once-a-day is: on a pool of N nodes each node
// tells once, so a stop is N letters. Named, not fixed here — the same open
// item as С7's.

import { log } from "./log.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { sendModerationStopped } from "./mailer.ts";
import { readModerationQueue } from "./queue_metrics.ts";
import { QUEUE_WAIT_MINUTES } from "./feed_verdict.ts";

// Nine of the ten: the rule's threshold in alerts.yml, for the same reason —
// at ten the sweep has already taken the evidence.
export const STOPPED_SECONDS = (QUEUE_WAIT_MINUTES - 1) * 60;

type Queue = { brand: string; oldestMinutes: number; waiting: number };
type Send = (to: string, queue: Queue) => Promise<boolean>;

let told = new Set<string>();

// Tests only: what this process was told outlives a suite otherwise.
export function forgetModerationWatch(): void {
  told = new Set<string>();
}

export async function watchModeration(options: {
  send?: Send;
  to?: string[];
} = {}): Promise<{ stopped: string[]; letters: string[] }> {
  const rows = await readModerationQueue();
  // Could not look: nothing learned, and nothing told or forgotten.
  if (rows === null) return { stopped: [], letters: [] };

  const stopped = rows.filter((row) => row.oldestSeconds > STOPPED_SECONDS);
  const stoppedBrands = new Set(stopped.map((row) => row.brand));
  // Alive again — under the threshold or empty: the next stop is news.
  for (const brand of told) {
    if (!stoppedBrands.has(brand)) told.delete(brand);
  }

  const send = options.send ?? sendModerationStopped;
  const letters: string[] = [];
  for (const row of stopped) {
    if (told.has(row.brand)) continue;
    const queue = { brand: row.brand, oldestMinutes: Math.floor(row.oldestSeconds / 60), waiting: row.waiting };
    let sent = false;
    for (const address of options.to ?? escalationAddresses()) {
      if (await send(address, queue)) sent = true;
    }
    if (sent) {
      told.add(row.brand);
      letters.push(row.brand);
    }
    log(sent ? "warn" : "error", sent ? "told people the moderation queue stopped" : "the moderation queue stopped and nobody could be told", {
      brand: row.brand,
      oldest_minutes: queue.oldestMinutes,
      waiting: row.waiting,
    });
  }
  return { stopped: [...stoppedBrands], letters };
}
