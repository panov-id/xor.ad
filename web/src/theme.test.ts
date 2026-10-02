// theme.ts: what "auto" and a hand-picked theme resolve to, and storage that
// throws (scripts/run-web-unit-tests.sh, node:test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO, readChoice, resolveTheme, saveChoice, storageKey } from "./theme.ts";
import { THEMES } from "./themes.gen.ts";

test("auto is the brand's light by day and its night pair at night", () => {
  for (const brand of Object.keys(THEMES)) {
    for (const phase of ["morning", "day", "sunset"] as const) assert.equal(resolveTheme(brand, AUTO, phase), "light", `${brand} ${phase}`);
    const night = THEMES[brand].find((t) => t.id === "light")?.night;
    assert.ok(night, `${brand} light names a night pair`);
    assert.equal(resolveTheme(brand, AUTO, "night"), night);
  }
});

test("a hand-picked theme is literal: it does not turn at night", () => {
  assert.equal(resolveTheme("sosed", "violet", "night"), "violet");
  assert.equal(resolveTheme("neighbro", "light", "night"), "light");
});

test("an unknown stored id is auto", () => {
  const store = new Map<string, string>([[storageKey("sosed"), "no-such"]]);
  assert.equal(readChoice("sosed", { getItem: (k) => store.get(k) ?? null }), AUTO);
  assert.equal(resolveTheme("sosed", "no-such", "day"), "light");
});

test("storage that throws reads as auto and saving does not throw", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(readChoice("sosed", broken), AUTO);
  assert.doesNotThrow(() => saveChoice("sosed", "violet", broken));
});

test("save then read round-trips; auto removes the key", () => {
  const store = new Map<string, string>();
  const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  saveChoice("neighbro", "azure", s);
  assert.equal(store.get("theme:neighbro"), "azure");
  assert.equal(readChoice("neighbro", s), "azure");
  saveChoice("neighbro", AUTO, s);
  assert.equal(store.has("theme:neighbro"), false);
});
