// The gates' address (router.ts), as the web's: a path names a gate; with a record on the disk the PIN is asked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gateOf, gateScreen, landing, pathOf, seatScreen } from "../router.ts";
import { parseQr, qrLink } from "../../../depth/core/place_qr.ts";

const record = { id: "me" } as never;

test("gateOf: the five gates by path, a trailing slash ignored", () => {
  assert.equal(gateOf("/"), "splash");
  assert.equal(gateOf("/register"), "register");
  assert.equal(gateOf("/restore/"), "restore");
  assert.equal(gateOf("/arrival"), "arrival");
  assert.equal(gateOf("/unlock"), "unlock");
});
test("gateOf: a seated path is no gate", () => {
  assert.equal(gateOf("/feed"), null);
  assert.equal(gateOf("/me/pin"), null);
});
test("gateScreen with no record: a gate opens itself; anything else is the splash", () => {
  assert.deepEqual(gateScreen("/register"), { at: "register" });
  assert.deepEqual(gateScreen("/arrival"), { at: "arrival" });
  assert.deepEqual(gateScreen("/restore"), { at: "restore" });
  assert.deepEqual(gateScreen("/feed"), { at: "splash" });
  assert.deepEqual(gateScreen("/unlock"), { at: "splash" }); // nothing to unlock
});
test("gateScreen with a record: the PIN on every path but /restore; one does not register over an identity", () => {
  assert.deepEqual(gateScreen("/", record), { at: "unlock", record });
  assert.deepEqual(gateScreen("/register", record), { at: "unlock", record });
  assert.deepEqual(gateScreen("/arrival", record), { at: "unlock", record });
  assert.deepEqual(gateScreen("/feed", record), { at: "unlock", record });
  assert.deepEqual(gateScreen("/unlock", record), { at: "unlock", record });
  assert.deepEqual(gateScreen("/restore", record), { at: "restore" });
});
test("landing: no place chosen is the place screen, not the feed of Rome; a place QR opens the place at its point", () => {
  assert.deepEqual(landing(null, false), { at: "place" });
  assert.deepEqual(landing(null, true), { at: "feed" });
  const qr = parseQr(new URL(qrLink("https://sosed.place", { lat: 34.6786, lon: 33.0413 }, 2)).hash)!;
  assert.ok(qr, "the link the place QR draws reads back");
  assert.equal(qr.s, 2);
  assert.ok(Math.abs(qr.lat - 34.6786) < 0.01 && Math.abs(qr.lon - 33.0413) < 0.01, `the cell's centre is near the point: ${qr.lat}, ${qr.lon}`);
  assert.deepEqual(landing(qr, true), { at: "place", start: qr });
  assert.equal(pathOf({ at: "place" }), "/place");
  assert.deepEqual(seatScreen("/place"), { at: "place" });
});
test("pathOf: the splash and loading share \"/\" as in the web; the gates keep their own", () => {
  assert.equal(pathOf({ at: "loading" }), "/");
  assert.equal(pathOf({ at: "splash" }), "/");
  assert.equal(pathOf({ at: "register" }), "/register");
  assert.equal(pathOf({ at: "unlock", record }), "/unlock");
});
