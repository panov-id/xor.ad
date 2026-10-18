// "Me"'s pure part (me-logic.ts) and the band it stands on (depth/core/limits.ts ageBand, shared with the web's
// AgeFilter): the filter's track and what it sends, the step away's price, the sheets' dates and countries.
// scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ageBand } from "../../../../depth/core/limits.ts";
import { along, awayRows, countryName, dayMonth, filterPatch, filterRange, initial, moveHandle, noTop, rangeText, revisionDay } from "./me-logic.ts";

test("ageBand: ±2 from 13 up to 20, an open top from 21 with the bottom at most 21", () => {
  assert.deepEqual(ageBand(13), { low: 13, high: 15 });
  assert.deepEqual(ageBand(17), { low: 15, high: 19 });
  assert.deepEqual(ageBand(20), { low: 18, high: 22 });
  assert.deepEqual(ageBand(21), { low: 19, high: null });
  assert.deepEqual(ageBand(32), { low: 21, high: null });
});

test("filterRange: an adult's track is 21..41 (w4_age-filter: 25 and 35 sit at a fifth and seven tenths)", () => {
  const r = filterRange(32, 25, 35);
  assert.deepEqual(r, { min: 21, max: 41, from: 25, to: 35, open: true });
  assert.equal(along(r, r.from), 0.2);
  assert.equal(along(r, r.to), 0.7);
  assert.equal(rangeText(r), "25–35");
  assert.deepEqual(filterPatch(r), { filter_age_min: 25, filter_age_max: 35 });
});

test("filterRange: nothing kept is the whole band; an open top reads 21+ and sends null", () => {
  const r = filterRange(32);
  assert.equal(noTop(r), true);
  assert.equal(rangeText(r), "21+");
  assert.deepEqual(filterPatch(r), { filter_age_min: 21, filter_age_max: null });
});

test("filterRange: a teen's band is closed (no 'no limit'), and values outside it are pulled in", () => {
  const r = filterRange(16, 10, 30);
  assert.deepEqual(r, { min: 14, max: 18, from: 14, to: 18, open: false });
  assert.equal(noTop(r), false);
  assert.deepEqual(filterPatch(r), { filter_age_min: 14, filter_age_max: 18 });
});

test("moveHandle: a handle that goes past the other takes it along; the band holds both", () => {
  const r = filterRange(32, 25, 35);
  assert.deepEqual([moveHandle(r, "from", 38).from, moveHandle(r, "from", 38).to], [38, 38]);
  assert.deepEqual([moveHandle(r, "to", 22).from, moveHandle(r, "to", 22).to], [22, 22]);
  assert.equal(moveHandle(r, "to", 99).to, 41);
  assert.equal(moveHandle(r, "from", 5).from, 21);
});

test("awayRows: a talk that outlasts the break waits, one whose end comes first ends", () => {
  const now = 1_000_000;
  const rows = awayRows({ phrases: 2, likes: 5, ends: [now + 30 * 60, now + 2 * 3600, now + 86400] }, 60, now);
  assert.deepEqual(rows, { phrases: 2, likes: 5, wait: 2, end: 1 });
  assert.equal(awayRows({ phrases: 0, likes: 0, ends: [now + 30 * 60] }, 20, now).wait, 1);
});

test("dayMonth: the sheets' «12 Oct» in English, the day first in Russian; a revision date is that day everywhere", () => {
  assert.equal(dayMonth("en", new Date(2026, 9, 12, 12)), "12 Oct");
  assert.match(dayMonth("ru", new Date(2026, 9, 12, 12)), /^12 окт/);
  assert.equal(revisionDay("2026-10-14").getDate(), 14);
  assert.equal(dayMonth("en", revisionDay("2026-10-14")), "14 Oct");
});

test("countryName and initial", () => {
  assert.equal(countryName("en", "GE"), "Georgia");
  assert.equal(countryName("en", undefined), "");
  assert.equal(initial(" alex"), "A");
  assert.equal(initial(""), "?");
});
