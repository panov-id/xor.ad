import { say } from "./say.ts";

// A span of minutes as a person says it: 260 → «4 ч 20 мин», 60 → «1 ч», 45 →
// «45 мин». The units are the dictionary's abbreviations ("web.duration.h",
// "web.duration.min"), which take no plural form in any of the seventeen
// languages, so one line each serves every count.
export function duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(say("web.duration.h", { n: hours }));
  if (rest > 0 || hours === 0) parts.push(say("web.duration.min", { n: rest }));
  return parts.join(" ");
}

// A span of seconds the same way (a move's clock): 298 → «4 мин 58 с», 45 → «45 с»,
// 3600 → «1 ч». The seconds unit is the table's own "table.seconds"; the node may
// send no clock at all, and then it is a dash.
export function durationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(duration(minutes));
  if (rest > 0 || minutes === 0) parts.push(`${rest} ${say("table.seconds")}`);
  return parts.join(" ");
}
