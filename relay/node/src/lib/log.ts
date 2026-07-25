// Structured JSON logging — one line per event, machine-parseable (Loki/etc).
//
// stdout is the primary sink and always gets everything. On top of that, the
// noteworthy levels are copied into object storage so the panel can read them
// without shell access to the node. Only warn/error are kept: info is one line
// per request, which would mean an object per request.

import { config } from "../config.ts";
import { put, storageEnabled } from "./storage.ts";

type Level = "info" | "warn" | "error";

const PERSISTED_LEVELS: readonly Level[] = ["warn", "error"];

// A node in trouble logs errors in bursts, and every persisted line is a storage
// request. Past this many writes in flight the copy is dropped rather than
// queued — the incident matters more than its complete transcript, and stdout
// still has every line.
const MAX_WRITES_IN_FLIGHT = 32;

let writesInFlight = 0;
let droppedSinceLastWrite = 0;

export function shouldPersist(level: Level): boolean {
  return PERSISTED_LEVELS.includes(level);
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    node: config.nodeId,
    env: config.envName,
    ...fields,
  };
  (level === "error" ? console.error : console.log)(JSON.stringify(entry));
  if (shouldPersist(level)) persist(entry);
}

function persist(entry: Record<string, unknown>): void {
  if (!storageEnabled()) return;
  if (writesInFlight >= MAX_WRITES_IN_FLIGHT) {
    droppedSinceLastWrite += 1;
    return;
  }
  // Carried on the next line that does get through, so a reader of the stored
  // logs can see the gap instead of quietly reading a partial record.
  if (droppedSinceLastWrite > 0) {
    entry.dropped_before = droppedSinceLastWrite;
    droppedSinceLastWrite = 0;
  }
  writesInFlight += 1;
  put(`server-logs/${config.envName}/${crypto.randomUUID()}.json`, entry)
    // Straight to the console: routing this back through log() would recurse
    // through persist() on every failed write.
    .catch((error) => console.error(`[log] persisting a ${entry.level} line failed: ${error}`))
    .finally(() => {
      writesInFlight -= 1;
    });
}
