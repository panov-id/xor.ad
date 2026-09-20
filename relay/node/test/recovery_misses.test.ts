// The node-wide brake on paper codes, by the clock.
//
// The route suite proves the brake comes on at fifty misses and that a genuine
// code waits with everyone else. What it cannot prove is that the pause ever
// ends: it reopens the route by resetting the module, which is the test
// arranging the answer rather than measuring it — noted by the consistency lens
// of the review panel, 2026-09-20, against test map row 5.6a.
//
// Here the clock is the argument. Both functions take `now`, so fifteen minutes
// pass without anything sleeping for fifteen minutes.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { countMiss, PAUSE_MS, pausedFor, reset, SHARED_MISS_MAX } from "../src/lib/recovery_misses.ts";

Deno.test("the pause comes on at the threshold and lets go on its own", () => {
  reset();
  const start = Date.now();
  for (let i = 0; i < SHARED_MISS_MAX - 1; i++) {
    assertEquals(countMiss(start), false, `the brake came on at miss ${i + 1}`);
    assertEquals(pausedFor(start), 0, `the route paused at miss ${i + 1}`);
  }
  assertEquals(countMiss(start), true, "the fiftieth miss did not start the pause");
  assert(pausedFor(start) > 0, "the route is not paused after the threshold");

  // A second before the end it is still on, and at the end it is gone. The
  // edge is checked from both sides because "fifteen minutes" is the promise,
  // not "eventually".
  assert(pausedFor(start + PAUSE_MS - 1000) > 0, "the pause let go early");
  assertEquals(pausedFor(start + PAUSE_MS), 0, "the pause outlived its fifteen minutes");
  reset();
});

Deno.test("misses older than an hour do not add up to a pause", () => {
  reset();
  const start = Date.now();
  const hour = 60 * 60 * 1000;
  // Forty-nine misses, then a long quiet, then one more: the window has moved
  // past the first lot, so the fiftieth miss of the day is not the fiftieth of
  // the hour. Without the window the brake would come on for a node that is
  // merely old.
  for (let i = 0; i < SHARED_MISS_MAX - 1; i++) countMiss(start);
  assertEquals(countMiss(start + hour + 1000), false, "misses from an hour ago still counted");
  assertEquals(pausedFor(start + hour + 1000), 0, "an old hour's misses paused the route");
  reset();
});

Deno.test("the pause is not restarted by every miss that follows it", () => {
  reset();
  const start = Date.now();
  for (let i = 0; i < SHARED_MISS_MAX; i++) countMiss(start);
  assert(pausedFor(start) > 0);
  // Somebody keeps knocking while the brake is on. If each knock restarted the
  // pause, fifteen minutes would become for ever for as long as the flood
  // lasted — and a flood is exactly when a genuine code needs the route back.
  for (let i = 0; i < 100; i++) countMiss(start + 1000);
  assertEquals(pausedFor(start + PAUSE_MS), 0, "knocking during the pause extended it");
  reset();
});
