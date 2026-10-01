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

test("longitude to zone", () => {
  assert.equal(zoneOfLongitude(0), "Etc/GMT");
  assert.equal(zoneOfLongitude(37.6), "Etc/GMT-3");
  assert.equal(zoneOfLongitude(-74), "Etc/GMT+5");
  assert.equal(zoneOfLongitude(179.9), "Etc/GMT-12");
});
