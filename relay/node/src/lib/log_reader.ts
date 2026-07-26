// Reading a log collection stored as one object per record.
//
// The keys are random UUIDs, so order lives only in the listing metadata. That
// listing is cheap (one request) while reading objects is not (one request each),
// which shapes the whole design: the window, the ordering and the histogram are
// all decided from the listing, and only the page that survives that decision is
// actually read.
//
// The window/cursor/bucket logic below is pure, so it is tested without a
// transport; readLogPage is the only part that touches storage.

import type { StorageEntry } from "./storage.ts";
import type { ScopedStorage } from "./scoped_storage.ts";

// Only the two operations a log read needs. Narrower than ScopedStorage on
// purpose: a reader that cannot write cannot be handed a writable scope by
// accident.
type LogSource = Pick<ScopedStorage, "get" | "listDetailed">;

// A reader who may see only part of a shared collection (a tenant reading the
// platform-wide audit trail) supplies this. It is not a convenience filter: the
// counts below are what a filter outside this function would leave lying — a
// tenant must not be told how many records it cannot see.
export type LogFilter = (record: Record<string, unknown>) => boolean;

// Filtering costs exactly what the listing-based path saves: whether a record
// belongs to the reader is only knowable after reading it. So a filtered read
// reads its whole window, newest first, and stops here — a page that says
// "truncated" is honest, an unbounded read of a growing collection is not.
const FILTER_SCAN_CAP = 500;

export interface LogWindow {
  from?: string; // inclusive ISO lower bound
  to?: string; // inclusive ISO upper bound
  before?: string; // exclusive ISO cursor — "older than this", for paging back
  limit: number;
}

export interface HistogramBucket {
  at: string; // ISO start of the bucket
  count: number;
}

export interface LogPage<T> {
  rows: T[];
  total: number; // objects in the collection, ignoring the window
  matched: number; // objects inside the window
  truncated: boolean; // matched > rows.length — say so, never imply completeness
  buckets: HistogramBucket[];
}

// Entries inside the window, newest first, capped at the limit. Entries whose
// timestamp the transport could not report are dropped once any bound is given:
// an unplaceable record cannot honestly be called inside or outside a window.
export function selectEntries(
  entries: readonly StorageEntry[],
  window: LogWindow,
): { page: StorageEntry[]; matched: number } {
  const bounded = Boolean(window.from || window.to || window.before);
  const matching = entries.filter((entry) => {
    if (!entry.createdAt) return !bounded;
    if (window.from && entry.createdAt < window.from) return false;
    if (window.to && entry.createdAt > window.to) return false;
    if (window.before && entry.createdAt >= window.before) return false;
    return true;
  });
  const ordered = [...matching].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
  return { page: ordered.slice(0, window.limit), matched: ordered.length };
}

// Counts per equal-width time bucket across the window — the shape of the load,
// computed from the listing alone (no object reads). Bounds default to the span
// the entries themselves cover.
export function bucketize(
  entries: readonly StorageEntry[],
  bucketCount: number,
  from?: string,
  to?: string,
): HistogramBucket[] {
  const stamps = entries
    .map((entry) => Date.parse(entry.createdAt))
    .filter((value) => !Number.isNaN(value));
  if (stamps.length === 0 || bucketCount < 1) return [];

  const start = from ? Date.parse(from) : Math.min(...stamps);
  const end = to ? Date.parse(to) : Math.max(...stamps);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  // A zero-width span (one record, or from === to) still deserves one bucket
  // rather than a division by zero.
  const width = Math.max((end - start) / bucketCount, 1);
  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_unused, index) => ({
    at: new Date(start + index * width).toISOString(),
    count: 0,
  }));
  for (const stamp of stamps) {
    if (stamp < start || stamp > end) continue;
    const index = Math.min(Math.floor((stamp - start) / width), bucketCount - 1);
    buckets[index].count += 1;
  }
  return buckets;
}

// One page of a log collection: list once, decide, then read only what is shown.
// With a filter the order reverses — read the window, then decide — see
// filteredPage below.
export async function readLogPage<T>(
  source: LogSource,
  prefix: string,
  window: LogWindow,
  bucketCount: number,
  keep?: LogFilter,
): Promise<LogPage<T>> {
  const entries = await source.listDetailed(prefix);
  if (keep) return await filteredPage<T>(source, prefix, entries, window, bucketCount, keep);
  const { page, matched } = selectEntries(entries, window);
  const records = await Promise.all(
    page.map(async (entry) => {
      const record = await source.get<Record<string, unknown>>(`${prefix}/${entry.name}`);
      // stored_at is the storage timestamp the ordering is based on; a record's
      // own received_at is written by the sink and may differ.
      return record === null ? null : { id: entry.name, stored_at: entry.createdAt, ...record };
    }),
  );
  return {
    rows: records.filter((record) => record !== null) as T[],
    total: entries.length,
    matched,
    truncated: matched > page.length,
    buckets: bucketize(
      selectEntries(entries, { ...window, limit: entries.length }).page,
      bucketCount,
      window.from,
      window.to,
    ),
  };
}

// The filtered path. Every number it returns counts kept records only: `total`
// stops meaning "objects in the collection" and starts meaning "records this
// reader has", which is both the safe answer and the one they asked for.
async function filteredPage<T>(
  source: LogSource,
  prefix: string,
  entries: readonly StorageEntry[],
  window: LogWindow,
  bucketCount: number,
  keep: LogFilter,
): Promise<LogPage<T>> {
  const inWindow = selectEntries(entries, { ...window, limit: entries.length }).page;
  const scanned = inWindow.slice(0, FILTER_SCAN_CAP);
  const read = await Promise.all(
    scanned.map(async (entry) => {
      const record = await source.get<Record<string, unknown>>(`${prefix}/${entry.name}`);
      return record === null ? null : { entry, record };
    }),
  );
  const kept = read.filter((item) => item !== null && keep(item.record)) as {
    entry: StorageEntry;
    record: Record<string, unknown>;
  }[];
  const page = kept.slice(0, window.limit);
  return {
    rows: page.map(({ entry, record }) => ({
      id: entry.name,
      stored_at: entry.createdAt,
      ...record,
    })) as T[],
    total: kept.length,
    matched: kept.length,
    // Two ways to be incomplete: more kept records than fit the page, or a
    // window deeper than the scan cap. Both are the same sentence to a reader.
    truncated: kept.length > page.length || inWindow.length > scanned.length,
    buckets: bucketize(kept.map(({ entry }) => entry), bucketCount, window.from, window.to),
  };
}
