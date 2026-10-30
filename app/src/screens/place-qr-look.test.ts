// place-qr by its sheet (the owner's word, 28.10): a place QR opened lands on the feed with a question sheet over it
// («look here?», «later», «yes»), not on the place screen. Read from the source: an app that routes the QR elsewhere fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../shell/App.tsx", import.meta.url), "utf8");

test("place-qr: the seat with a QR keeps the feed and asks over it", () => {
  assert.match(app, /setQrAsk\(/, "App.tsx: a QR does not raise the question over the feed");
  assert.doesNotMatch(app, /if \(to\.at === "place"\) qrUsed\.current = true;/, "App.tsx: a QR still opens the place screen");
});

test("place-qr: the question has «later» and «yes»", () => {
  const ask = app.split("function QrAsk(")[1] ?? "";
  for (const id of ["place-qr-ask", "place-qr-later", "place-qr-yes"]) {
    assert.ok(ask.includes(`"${id}"`), `App.tsx: the QR question has no ${id}`);
  }
});
