// Watchdog С7: the age of the last nightly dump (docs/watchdogs_RU.md).
//
// Until 2026-09-15 the backup did not run for four nights and nobody learned
// of it; the gate on the script catches a broken command, not a dead network
// or a timer that never fires. So the node looks, every hour, at the marker the
// backup script leaves after a dump went up (relay/wizard/backup-postgres.sh):
// `backups/<env>/last-ok.json` in the WORKING zone. Not the dumps themselves:
// they may live in their own zone, whose key is kept off the node on purpose
// (loop, 2026-09-24 — reading them would put the second copy's key where a
// break-in of the node reaches it).
//
// Older than BACKUP_AGE_ALERT_HOURS (26: a nightly dump, an hour to spare) and
// the escalation addresses get a letter — from the node itself, because the
// boxes run no Alertmanager. Once a day at most while it stays old, per node:
// a missed backup is news once, not every hour.
//
// No marker at all is the first night after a deploy as often as it is a
// backup that never ran; it is read as old only once the node has been up
// longer than the threshold.

import { config } from "../config.ts";
import { scopedForBrand } from "./scoped_storage.ts";
import { setGauge } from "./metrics.ts";
import { log } from "./log.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { sendBackupStale } from "./mailer.ts";

const A_DAY_MS = 24 * 60 * 60 * 1000;
const startedAt = Date.now();
let lastLetterAt = 0;

type Send = (to: string, ageHours: number | null) => Promise<boolean>;

export function forgetBackupWatch(): void {
  lastLetterAt = 0;
}

export async function watchBackup(options: {
  now?: number;
  upSince?: number;
  send?: Send;
  to?: string[];
} = {}): Promise<{ ageHours: number | null; stale: boolean; told: boolean }> {
  const now = options.now ?? Date.now();
  const upSince = options.upSince ?? startedAt;
  const threshold = config.backupAgeAlertHours * 60 * 60 * 1000;
  // The platform's own scope: an empty prefix, the same path the script writes.
  const marker = await scopedForBrand(null).get<{ at?: string }>(`backups/${config.envName}/last-ok.json`);
  const at = marker?.at ? Date.parse(marker.at) : NaN;
  const age = Number.isFinite(at) ? now - at : null;
  setGauge("relay_backup_age_seconds", age === null ? -1 : Math.round(age / 1000));
  // A marker from the future is a clock or a script gone wrong, not a fresh
  // dump: read as late, or it would silence this watchdog for good (panel
  // 2026-09-24, security lens). An hour of skew is let through.
  const stale = age === null ? now - upSince > threshold : age > threshold || age < -60 * 60 * 1000;
  if (!stale || now - lastLetterAt < A_DAY_MS) {
    return { ageHours: age === null ? null : age / 3_600_000, stale, told: false };
  }
  const send = options.send ?? sendBackupStale;
  const ageHours = age === null ? null : Math.floor(age / 3_600_000);
  let told = false;
  for (const address of options.to ?? escalationAddresses()) {
    if (await send(address, ageHours)) told = true;
  }
  if (told) lastLetterAt = now;
  log(told ? "warn" : "error", told ? "told people the backup is old" : "the backup is old and nobody could be told", {
    env: config.envName,
    age_hours: ageHours,
  });
  return { ageHours: age === null ? null : age / 3_600_000, stale, told };
}
