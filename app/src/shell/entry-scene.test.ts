// The entry frame's left scene (tokens/wide.css, "the entry frame (TAB7)"): every screen the rule lists renders EntryScene.
// The splash, the register steps and the PIN door left the rule on 2026-10-30: docs/newdesign4 screens 01–11 draw their own wide layout
// (app/tokens/nd4.css: the name card by the form). The place left it on 2026-11-01: screens 22–29 are drawn whole from the archive.
// The list is read from the css, so a screen added to the rule without a scene (or a screen file that lost it) fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
// css data-screen value -> [the file that draws it, how many mains it draws]
const FILE: Record<string, [string, number]> = {
  arrival: ["../screens/Arrival.tsx", 1],
  "cabinet-sign-in": ["../screens/cabinet/SignIn.tsx", 3], "cabinet-sent": ["../screens/cabinet/SignIn.tsx", 3],
  "cabinet-expired": ["../screens/cabinet/SignIn.tsx", 3],
};

function listed(): string[] {
  const css = read("../../tokens/wide.css");
  const rule = css.slice(css.indexOf("the entry frame (TAB7"));
  const first = rule.slice(rule.indexOf(":is("), rule.indexOf(")", rule.indexOf(":is(")) + 1);
  return [...first.matchAll(/data-screen\^?="([^"]+)"/g)].map((m) => m[1]);
}

test("the entry rule lists screens, and each one is known here", () => {
  const names = listed();
  // 6 since 2026-10-30: register, unlock, forget-confirm, locked, restore and loading draw their own wide layout (nd4.css);
  // 5 since 2026-11-01: the place draws the archive's screens 22–29 whole
  // 4 since 2026-11-01: the intro draws the archive's screens 17–20 whole
  assert.ok(names.length >= 4, `read ${names.length} screens from wide.css`);
  assert.deepEqual(names.filter((n) => !(n in FILE)), [], "a screen in the css rule with no file in this test");
});

test("every screen of the entry rule renders EntryScene", () => {
  const bad: string[] = [];
  for (const n of listed()) {
    const [file, count] = FILE[n] ?? ["", 0];
    const uses = (read(file).match(/<EntryScene\b/g) ?? []).length;
    // forget-confirm shares Unlock.tsx with unlock: two scenes there
    const need = file.endsWith("Unlock.tsx") ? 2 : count;
    if (uses < need) bad.push(`${n}: ${file} renders ${uses} EntryScene, needs ${need}`);
  }
  assert.deepEqual(bad, []);
});
