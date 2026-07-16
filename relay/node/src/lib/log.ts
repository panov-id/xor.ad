// Structured JSON logging — one line per event, machine-parseable (Loki/etc).

import { config } from "../config.ts";

type Level = "info" | "warn" | "error";

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    node: config.nodeId,
    env: config.envName,
    ...fields,
  });
  (level === "error" ? console.error : console.log)(line);
}
