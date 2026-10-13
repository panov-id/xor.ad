// geo/qr.ts: the place QR's link — the node's grid, the same link for one cell, a strict parse
// (scripts/run-web-unit-tests.sh, node:test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, centreOf, parseQr, qrLink } from "./qr.ts";

const LIMASSOL = { lat: 34.6823, lon: 33.0464 };

test("the cell is the node's grid: latitude step = metres / 111320, longitude step from the rounded latitude", () => {
  const { i, j } = cellOf(LIMASSOL, 3);
  const dPhi = 1000 / 111320;
  assert.equal(i, Math.round(34.6823 / dPhi));
  const latQ = i * dPhi;
  assert.equal(j, Math.round(33.0464 / (1000 / (111320 * Math.cos((latQ * Math.PI) / 180)))));
  // The cosine from the exact latitude moves a far longitude into the next cell somewhere on this sweep.
  for (let lat = -70; lat <= 70; lat += 0.37) {
    const p = { lat, lon: 170.123 }, c = cellOf(p, 1), q = Math.round(lat / (100 / 111320)) * (100 / 111320);
    assert.equal(c.j, Math.round(170.123 / (100 / (111320 * Math.cos((q * Math.PI) / 180)))), `lat ${lat}`);
  }
});

test("two points in one cell make one link; the link carries no more than the cell", () => {
  const a = qrLink("https://sosed.place", LIMASSOL, 2);
  const b = qrLink("https://sosed.place", { lat: 34.6824, lon: 33.0465 }, 2);
  assert.equal(a, b);
  assert.match(a, /^https:\/\/sosed\.place\/location#p=-?\d+\.-?\d+&s=2$/);
});

test("a link opens at its cell's centre, and that centre is its own cell", () => {
  const link = qrLink("https://sosed.place", LIMASSOL, 4);
  const at = parseQr(new URL(link).hash);
  assert.ok(at);
  assert.equal(at.s, 4);
  assert.ok(Math.abs(at.lat - LIMASSOL.lat) < 0.03 && Math.abs(at.lon - LIMASSOL.lon) < 0.04);
  const again = cellOf(at, 4), { i, j } = cellOf(LIMASSOL, 4);
  assert.deepEqual(again, { i, j });
  assert.deepEqual(centreOf(i, j, 4), { lat: at.lat, lon: at.lon });
});

test("anything off the spec's shape is no QR", () => {
  for (const bad of ["", "#", "#p=1.2", "#s=2", "#p=1.2&s=0", "#p=1.2&s=6", "#p=1.2&s=22", "#p=../..&s=1",
    "#p=1.2&s=1&x=3", "#s=1&p=1.2", "#p=1,2&s=1", "#p=1.2.3&s=1", "#p=1234567.1&s=1", "#p=999999.1&s=1", "#p=1.9999999&s=5"]) {
    assert.equal(parseQr(bad), null, bad);
  }
  assert.ok(parseQr("#p=0.0&s=1"));
  assert.ok(parseQr("p=-10.-20&s=5"));
});
