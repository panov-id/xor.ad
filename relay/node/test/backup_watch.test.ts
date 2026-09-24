// Watchdog С7 (lib/backup_watch.ts): the marker the backup script leaves after
// a dump went up, read from the working zone. No database — storage is a
// directory here, and the letter is a function the case holds.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const dir = await Deno.makeTempDir();
const configured = suite({ STORAGE_TRANSPORT: "fs", STORAGE_DIR: dir, NODE_ENV_NAME: "dev", BACKUP_AGE_ALERT_HOURS: "26" });
const { watchBackup, forgetBackupWatch } = await import("../src/lib/backup_watch.ts");
const { put } = await import("../src/lib/storage.ts");

const HOUR = 3_600_000;
const now = Date.parse("2026-09-24T12:00:00Z");
const letters = () => {
  const sent: Array<number | null> = [];
  return { sent, send: (_to: string, age: number | null) => { sent.push(age); return Promise.resolve(true); } };
};

// The letter logs, and the log copies itself to storage without being awaited.
configured({ name: "a fresh dump says nothing, an old one writes once a day", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  forgetBackupWatch();
  const l = letters();
  await put("backups/dev/last-ok.json", { at: new Date(now - 9 * HOUR).toISOString() });
  const fresh = await watchBackup({ now, send: l.send, to: ["ops@example.test"] });
  assertEquals(fresh.stale, false);
  assertEquals(l.sent, [], "a dump nine hours old raised the alarm");

  await put("backups/dev/last-ok.json", { at: new Date(now - 30 * HOUR).toISOString() });
  const old = await watchBackup({ now, send: l.send, to: ["ops@example.test"] });
  assert(old.stale, "a dump thirty hours old was not called late");
  assertEquals(l.sent, [30], "the letter did not say how old the dump is");
  await watchBackup({ now: now + HOUR, send: l.send, to: ["ops@example.test"] });
  assertEquals(l.sent.length, 1, "a late backup wrote again an hour later");
  await watchBackup({ now: now + 25 * HOUR, send: l.send, to: ["ops@example.test"] });
  assertEquals(l.sent.length, 2, "a backup still late a day later was not told again");

  // A marker from the future is not a fresh dump.
  forgetBackupWatch();
  await put("backups/dev/last-ok.json", { at: new Date(now + 5 * HOUR).toISOString() });
  const future = await watchBackup({ now, send: l.send, to: ["ops@example.test"] });
  assert(future.stale, "a marker five hours in the future silenced the watchdog");
} });

configured({ name: "no marker is the first night until the node has been up past the threshold", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  forgetBackupWatch();
  const l = letters();
  await Deno.remove(`${dir}/backups/dev/last-ok.json`).catch(() => {});
  const young = await watchBackup({ now, upSince: now - 2 * HOUR, send: l.send, to: ["ops@example.test"] });
  assertEquals(young.stale, false, "a node two hours old was told no backup ran");
  const grown = await watchBackup({ now, upSince: now - 27 * HOUR, send: l.send, to: ["ops@example.test"] });
  assert(grown.stale, "a node up a day with no backup seen said nothing");
  assertEquals(l.sent, [null]);
} });
