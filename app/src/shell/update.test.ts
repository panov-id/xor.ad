// Screen 15 `update`: which server version counts as newer, and that App shows the screen over everything
// (version.json in the build is checked on the build's own output). Read from the sources where React is in the way.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { newer } from "./update-logic.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("update 15: only a higher dotted version is newer", () => {
  assert.equal(newer("1.1.0", "1.0.0"), true);
  assert.equal(newer("1.0.10", "1.0.9"), true, "parts compare as numbers, not text");
  assert.equal(newer("1.1", "1.0.5"), true, "a missing part is zero");
  assert.equal(newer("1.0.0", "1.0.0"), false);
  assert.equal(newer("0.9.9", "1.0.0"), false);
  assert.equal(newer("1.0", "1.0.0"), false);
  assert.equal(newer("<html>", "1.0.0"), false, "a page in place of the json is not a version");
});

test("update 15: App lays the screen over the rest, a fixed dialog over everything", () => {
  assert.match(read("./App.tsx"), /\{fresh\.version && <Update version=\{fresh\.version\} onLater=\{fresh\.later\} \/>\}/);
  const css = read("../../tokens/nd4-kit.css");
  assert.match(css, /main\.nd-screen\[data-bare\]\[role="dialog"\] \{ position: fixed; inset: 0; z-index: 50;/, "the update is not over everything");
});

test("update 15: × and «Later» put it off, «Update» reloads", () => {
  const screen = read("../screens/Update.tsx");
  assert.match(screen, /onLater=\{onLater\}/, "× and «Later» do not put the update off");
  assert.match(screen, /onGo=\{\(\) => location\.reload\(\)\}/, "«Update» does not reload");
  const gen = read("../nd4/screens/update.gen.tsx");
  assert.match(gen, /onClick=\{p\.onLater\}[^>]*data-testid="update-close"/, "the × is not «Later»");
  assert.match(gen, /onClick=\{p\.onLater\} data-testid="update-later"/);
  assert.match(gen, /onClick=\{p\.onGo\} data-testid="update-go"/);
});
