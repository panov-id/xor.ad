// sosed's themes (owner 2026-10-26; NEWDESIGN_PLAN §3): the old ids read as the new ones, «auto» turns on the hour, the
// four blocks are the designer's, and every --c-* the shell still uses has an alias in themes.css.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { OLD_IDS, readChoice, resolveTheme, saveChoice, STORAGE_KEY, THEMES } from "./theme.ts";

const store = (v: string | null) => ({ getItem: (k: string) => (k === STORAGE_KEY ? v : null) });

test("a theme kept under an old id reads as the new one (3 of 3, plus Dusk)", () => {
  assert.equal(readChoice(store("light")), "white", "a kept «light» did not become white");
  assert.equal(readChoice(store("dark")), "black", "a kept «dark» did not become black");
  assert.equal(readChoice(store("auto")), "auto", "a kept «auto» did not stay auto");
  assert.equal(readChoice(store("dusk")), "plum", "the old shell's Dusk did not become plum");
  for (const id of THEMES) assert.equal(readChoice(store(id)), id, `a kept ${id} was not read back`);
  assert.equal(readChoice(store("neon")), "auto", "an unknown id did not fall back to auto");
  assert.equal(readChoice(store(null)), "auto");
  assert.equal(readChoice({ getItem: () => { throw new Error("blocked"); } }), "auto", "blocked storage broke the theme");
  assert.deepEqual(Object.keys(OLD_IDS).sort(), ["auto", "dark", "dusk", "light"]);
});

test("auto is white by day and black by night; a picked theme does not turn", () => {
  assert.equal(resolveTheme("auto", 12), "white");
  assert.equal(resolveTheme("auto", 5), "white");
  assert.equal(resolveTheme("auto", 21), "black");
  assert.equal(resolveTheme("auto", 3), "black");
  assert.equal(resolveTheme("sea", 3), "sea", "a picked theme turned at night");
});

test("saving auto forgets the key; saving a theme keeps it", () => {
  const kept = new Map<string, string>();
  const s = { setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  saveChoice("plum", s);
  assert.equal(kept.get(STORAGE_KEY), "plum");
  saveChoice("auto", s);
  assert.equal(kept.has(STORAGE_KEY), false);
});

const css = readFileSync(new URL("../../../tokens/themes.css", import.meta.url), "utf8");

test("themes.css holds the four designer blocks with the same token names", () => {
  const names = THEMES.map((t) => {
    const m = new RegExp(`:root\\[data-theme="${t}"\\] \\{([\\s\\S]*?)\\n\\}`).exec(css);
    assert.ok(m, `themes.css has no block for ${t}`);
    return [...m[1].matchAll(/(--[a-z0-9-]+):/g)].map((x) => x[1]).sort().join(",");
  });
  assert.ok(names.every((n) => n === names[0]), "the four themes do not define the same tokens");
  for (const k of ["--bg", "--accent", "--text", "--panel-solid", "--tile", "--dur-2"]) assert.ok(names[0].includes(k), `the themes lost ${k}`);
});

test("every --c-* colour the shell uses has an alias to the theme (N of M named)", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = `${d}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : /\.(css|tsx)$/.test(f) ? [p] : [];
  });
  const root = new URL("../../", import.meta.url).pathname;
  const used = new Set<string>();
  for (const f of [...walk(`${root}`), ...walk(`${root}../tokens`)]) {
    for (const m of readFileSync(f, "utf8").matchAll(/var\((--c-[a-z0-9-]+)/g)) used.add(m[1]);
  }
  const block = /:root\[data-theme\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const aliased = new Set([...block.matchAll(/(--c-[a-z0-9-]+):/g)].map((m) => m[1]));
  // colours a component defines for itself (a board's cells, a die) are not the brand's palette
  const own = new Set<string>();
  for (const f of [...walk(`${root}`), ...walk(`${root}../tokens`)]) {
    for (const m of readFileSync(f, "utf8").matchAll(/(--c-[a-z0-9-]+):\s*(?!var\(--(bg|panel|tile|accent|text|on-accent|theirs|acc-))/g)) own.add(m[1]);
  }
  const palette = ["--c-night", "--c-nav-bar", "--c-sheet", "--c-panel", "--c-panel2", "--c-text", "--c-muted", "--c-ink", "--c-lime", "--c-peach", "--c-coral", "--c-lilac", "--c-yellow", "--c-avatar-1", "--c-avatar-2", "--c-avatar-3", "--c-avatar-4", "--c-avatar-5"];
  const missing = palette.filter((c) => used.has(c) && !aliased.has(c));
  assert.deepEqual(missing, [], `palette colours in use with no theme alias: ${missing.join(", ")}`);
  const stray = [...used].filter((c) => !aliased.has(c) && !own.has(c));
  assert.deepEqual(stray, [], `--c-* in use that nothing defines: ${stray.join(", ")}`);
});
