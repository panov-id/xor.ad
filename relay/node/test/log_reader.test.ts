// Unit tests for the log window/cursor/histogram logic (no net/fs).
// Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { bucketize, selectEntries } from "../src/lib/log_reader.ts";
import { canonicalTimestamp, type StorageEntry } from "../src/lib/storage.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

const entry = (name: string, createdAt: string): StorageEntry => ({ name, createdAt });

const SAMPLE: StorageEntry[] = [
  entry("a", "2026-07-25T10:00:00.000Z"),
  entry("b", "2026-07-25T11:00:00.000Z"),
  entry("c", "2026-07-25T12:00:00.000Z"),
  entry("d", "2026-07-25T13:00:00.000Z"),
];

configured("selectEntries returns newest first and caps at the limit", () => {
  const { page, matched } = selectEntries(SAMPLE, { limit: 2 });
  assertEquals(page.map((selected) => selected.name), ["d", "c"]);
  assertEquals(matched, 4); // matched counts the window, not the page
});

configured("selectEntries honours from/to bounds inclusively", () => {
  const { page, matched } = selectEntries(SAMPLE, {
    from: "2026-07-25T11:00:00.000Z",
    to: "2026-07-25T12:00:00.000Z",
    limit: 10,
  });
  assertEquals(page.map((selected) => selected.name), ["c", "b"]);
  assertEquals(matched, 2);
});

configured("before is an exclusive cursor — paging back cannot repeat a row", () => {
  const first = selectEntries(SAMPLE, { limit: 2 });
  assertEquals(first.page.map((selected) => selected.name), ["d", "c"]);

  const older = selectEntries(SAMPLE, {
    before: first.page[first.page.length - 1].createdAt,
    limit: 2,
  });
  assertEquals(older.page.map((selected) => selected.name), ["b", "a"]);
});

configured("entries with no timestamp are kept unbounded, dropped once a bound is given", () => {
  const withUnknown = [...SAMPLE, entry("unknown", "")];
  assertEquals(selectEntries(withUnknown, { limit: 10 }).matched, 5);
  assertEquals(
    selectEntries(withUnknown, { from: "2026-07-25T00:00:00.000Z", limit: 10 }).matched,
    4,
  );
  // Unplaceable entries sort last, so they never displace real newest rows.
  const { page } = selectEntries(withUnknown, { limit: 1 });
  assertEquals(page[0].name, "d");
});

configured("bucketize counts across the window without reading objects", () => {
  const buckets = bucketize(
    SAMPLE,
    3,
    "2026-07-25T10:00:00.000Z",
    "2026-07-25T13:00:00.000Z",
  );
  assertEquals(buckets.length, 3);
  assertEquals(buckets.map((bucket) => bucket.count), [1, 1, 2]); // 13:00 lands in the last
  assertEquals(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 4);
});

configured("bucketize degenerate inputs stay silent instead of throwing", () => {
  assertEquals(bucketize([], 10), []);
  assertEquals(bucketize(SAMPLE, 0), []);
  assertEquals(bucketize([entry("only", "2026-07-25T10:00:00.000Z")], 4).length, 4);
  // to before from is nonsense, not a crash.
  assertEquals(
    bucketize(SAMPLE, 4, "2026-07-25T13:00:00.000Z", "2026-07-25T10:00:00.000Z"),
    [],
  );
});

configured("canonicalTimestamp makes Bunny's zone-less UTC comparable", () => {
  // Bunny reports UTC without a suffix; treated as local time the ordering would
  // silently shift by the host's offset.
  assertEquals(canonicalTimestamp("2026-07-25T10:12:33.123"), "2026-07-25T10:12:33.123Z");
  assertEquals(canonicalTimestamp("2026-07-25T10:12:33.123Z"), "2026-07-25T10:12:33.123Z");
  assertEquals(canonicalTimestamp("2026-07-25T12:12:33+02:00"), "2026-07-25T10:12:33.000Z");
  assertEquals(canonicalTimestamp(undefined), "");
  assertEquals(canonicalTimestamp("not a date"), "");

  // Canonical form means lexicographic comparison is time comparison.
  assert(canonicalTimestamp("2026-07-25T10:00:00") < canonicalTimestamp("2026-07-25T11:00:00"));
});
