// The feed header's scene follows the time of day at the PLACE the feed is
// filtered to, not on the device (owner 2026-10-01): morning 5–11, day 11–17,
// sunset 17–21, night 21–5, each start inclusive.
export type Phase = "morning" | "day" | "sunset" | "night";

export function phaseOfHour(hour: number): Phase {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "sunset";
  return "night";
}

// The hour at the place; a zone that is missing or that Intl refuses
// (RangeError) falls back to the device's clock — a wrong sky is better
// than a feed that does not draw (review panel 01.10.2026, item 2).
export function phaseAt(date: Date, timeZone?: string): Phase {
  let hour = NaN;
  if (timeZone) {
    try {
      hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date));
    } catch {
      hour = NaN;
    }
  }
  if (!Number.isFinite(hour)) hour = date.getHours();
  return phaseOfHour(hour);
}

// The feed's place is a point (App.tsx `at`, lat/lon) with no zone of its own:
// nothing on the page or the node stores one. Until it does, the zone is the
// nautical one of the longitude — UTC + round(lon / 15) h, as an IANA
// Etc/GMT zone (whose sign is inverted by POSIX). It ignores borders and
// summer time: up to an hour or two off where a country's clock is. A
// longitude that is not a finite number gives no zone (undefined): the
// device's clock is used.
export function zoneOfLongitude(lon: number): string | undefined {
  if (typeof lon !== "number" || !Number.isFinite(lon)) return undefined;
  const offset = Math.max(-12, Math.min(14, Math.round(lon / 15)));
  if (offset === 0) return "Etc/GMT";
  return `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
