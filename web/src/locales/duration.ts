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
