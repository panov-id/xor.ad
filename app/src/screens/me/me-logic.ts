// The pure part of "Me" and what opens from it (sheets w4_*): no React, no node — tested in me.test.ts.
// The path, not @sdk: node:test (run-app-unit-tests.sh) has no aliases.
import { ageBand } from "../../../../depth/core/limits.ts";

/** The age filter's slider (w4_age-filter): the band's bottom to its top; an open top (from 21) gets twenty
 *  years of track, and the handle at its end means "no limit". `from`/`to` are what the node keeps, or the band. */
export type Range = { min: number; max: number; from: number; to: number; open: boolean };
export const OPEN_SPAN = 20;
export function filterRange(age: number, filterMin?: number | null, filterMax?: number | null): Range {
  const band = ageBand(age);
  const open = band.high === null;
  const max = band.high ?? band.low + OPEN_SPAN;
  const clamp = (v: number) => Math.min(max, Math.max(band.low, v));
  const from = clamp(filterMin ?? band.low);
  const to = Math.max(from, clamp(filterMax ?? max));
  return { min: band.low, max, from, to, open };
}
/** A handle moved: the pair stays from <= to (a handle that goes past the other takes it along). */
export function moveHandle(r: Range, which: "from" | "to", value: number): Range {
  const v = Math.min(r.max, Math.max(r.min, Math.round(value)));
  if (which === "from") return { ...r, from: v, to: Math.max(v, r.to) };
  return { ...r, to: v, from: Math.min(v, r.from) };
}
/** Where a value sits on the track, 0..1. */
export const along = (r: Range, v: number): number => (r.max === r.min ? 0 : (v - r.min) / (r.max - r.min));
/** No top: the handle stands at the end of an open band. */
export const noTop = (r: Range): boolean => r.open && r.to >= r.max;
/** What PATCH /identities/me gets: an open top is null. */
export const filterPatch = (r: Range): { filter_age_min: number; filter_age_max: number | null } =>
  ({ filter_age_min: r.from, filter_age_max: noTop(r) ? null : r.to });
/** The row in "Me" and the sub-line: "25–35", or "25+" with no top. */
export const rangeText = (r: Range): string => (noTop(r) ? `${r.from}+` : `${r.from}–${r.to}`);

/** A date as the sheets write it: "12 Oct" (English in the British order), "12 окт." in Russian. */
export function dayMonth(lang: string, at: Date): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short" }).format(at);
}
/** A manifest's revision date ("2026-10-14") as that calendar day at local noon: the same day read in every zone. */
export function revisionDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** A country's name from its code, in the page's language (w4_place: "Georgia"); the code when Intl has none. */
export function countryName(lang: string, cc: string | undefined): string {
  if (!cc) return "";
  try { return new Intl.DisplayNames([lang], { type: "region" }).of(cc) ?? cc; } catch { return cc; }
}

/** Stepping away (w4_step-away): what goes down, who is in on you, and the talks that outlast the break and
 *  so wait; a talk whose own end comes first ends (web StepAway's price). */
export function awayRows(counts: { phrases: number; likes: number; ends: number[] }, minutes: number, nowSeconds: number) {
  const back = nowSeconds + minutes * 60;
  return { phrases: counts.phrases, likes: counts.likes, wait: counts.ends.filter((end) => end >= back).length, end: counts.ends.filter((end) => end < back).length };
}

/** The first letter of a name for the avatar. */
export const initial = (name: string): string => [...name.trim()][0]?.toLocaleUpperCase() ?? "?";
