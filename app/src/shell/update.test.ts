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

test("update 15: App lays the screen over the rest", () => {
  assert.match(read("./App.tsx"), /\{fresh\.version && <Update version=\{fresh\.version\} onLater=\{fresh\.later\} \/>\}/);
  const screen = read("../screens/Update.tsx");
  assert.match(screen, /data-testid="update-later"[\s\S]{0,200}onClick=\{\(\) => location\.reload\(\)\} data-testid="update-go"/);
});

test("update 15: × and «Later» put it off, the laptop holds it as one block in the middle", () => {
  const screen = read("../screens/Update.tsx");
  assert.match(screen, /onClick=\{onLater\} data-testid="update-close"/, "the × does not put the update off");
  assert.match(screen, /className="nd-cta" data-tile="" onClick=\{onLater\}/, "«Later» is not the tile button");
  const css = read("../../tokens/nd4.css");
  assert.match(css, /@media \(min-width: 1280p[x]\) \{\s*\.nd-update \.nd-col \{ justify-content: center/, "the laptop does not centre the block");
});
