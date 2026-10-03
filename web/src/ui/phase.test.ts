// phaseAt's borders and its zone (scripts/run-web-unit-tests.sh, node:test).
// Each hour is built in UTC and read in a zone that is not the runner's: the
// runner is put on TZ=Pacific/Kiritimati (UTC+14), so a phase taken from the
// device's clock would come out wrong on every row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseAt, zoneOfLongitude } from "./phase.ts";

// Rome-ish: lon 12.5 → Etc/GMT-1, i.e. UTC+1.
const zone = zoneOfLongitude(12.5);
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 1, h - 1, m)); // local h:m at UTC+1

const borders: [number, number, string][] = [
  [4, 59, "night"], [5, 0, "morning"], [10, 59, "morning"], [11, 0, "day"],
  [16, 59, "day"], [17, 0, "sunset"], [20, 59, "sunset"], [21, 0, "night"],
];

for (const [h, m, want] of borders) {
  test(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} at the place is ${want}`, () => {
    assert.equal(phaseAt(at(h, m), zone), want, `phaseAt at ${h}:${m} (${zone}) should be ${want}`);
  });
}

test("the place's zone wins over the device's", () => {
  assert.notEqual(Intl.DateTimeFormat().resolvedOptions().timeZone, "Etc/GMT-1", "the runner must not sit in the place's zone");
  // 12:00 UTC: day in Rome (13:00), night in Vladivostok-ish lon 131.9 (22:00), morning at lon -75 (07:00).
  const noon = new Date(Date.UTC(2026, 9, 1, 12, 0));
  assert.equal(phaseAt(noon, zoneOfLongitude(12.5)), "day");
  assert.equal(phaseAt(noon, zoneOfLongitude(131.9)), "night");
  assert.equal(phaseAt(noon, zoneOfLongitude(-75)), "morning");
  assert.equal(phaseAt(noon, "Europe/Moscow"), "day");
});

// A place with no usable longitude, or a zone Intl refuses, falls back to the
// device's clock (the runner's UTC+14) instead of throwing (review panel 01.10.2026).
test("no zone, a NaN longitude or a zone Intl refuses: the device's hour, no throw", () => {
  // 00:00 UTC is 14:00 on the runner (UTC+14): day. A lost fallback reads hour NaN, which is night —
  // so the moment is chosen where the device's phase is NOT night, or the test could not tell (verifier 01.10.2026).
  const noon = new Date(Date.UTC(2026, 9, 1, 0, 0));
  assert.equal(noon.getHours(), 14, "the runner must sit on UTC+14 (scripts/run-web-unit-tests.sh)");
  const device = "day";
  assert.equal(zoneOfLongitude(Number.NaN), undefined, "a NaN longitude gives no zone");
  assert.equal(zoneOfLongitude(Infinity), undefined, "an infinite longitude gives no zone");
  assert.doesNotThrow(() => phaseAt(noon, zoneOfLongitude(Number.NaN)), "a NaN longitude must not throw");
  assert.equal(phaseAt(noon, zoneOfLongitude(Number.NaN)), device, "a NaN longitude reads the device's hour");
  assert.doesNotThrow(() => phaseAt(noon, "Not/AZone"), "a zone Intl refuses (RangeError) must not throw");
  assert.equal(phaseAt(noon, "Not/AZone"), device, "a refused zone reads the device's hour");
});

test("longitude to zone", () => {
  assert.equal(zoneOfLongitude(0), "Etc/GMT");
  assert.equal(zoneOfLongitude(37.6), "Etc/GMT-3");
  assert.equal(zoneOfLongitude(-74), "Etc/GMT+5");
  assert.equal(zoneOfLongitude(179.9), "Etc/GMT-12");
});
