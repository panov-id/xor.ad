// say(): Russian under the chosen language, the shell's own words on top, the key as the last word.
// Plus the real dictionaries: every language the shell offers has the keys the screens ask for.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { byLang, languagesOf, makeSay } from "../i18n-core.ts";

const depth = { ru: { "common.back": "назад", "a": "ру-а" }, en: { "common.back": "back" } };
const web = { ru: { "web.x": "икс {n}", "web.y": "игрек" }, en: { "web.x": "x {n}" } };
const app = { ru: { "app.z": "зет" } };

test("say: the language's word, then Russian, then the key itself", () => {
  const say = makeSay("en", [depth, web, app]);
  assert.equal(say("common.back"), "back");
  assert.equal(say("web.y"), "игрек"); // missing in en: Russian
  assert.equal(say("app.z"), "зет");
  assert.equal(say("nowhere.at.all"), "nowhere.at.all");
});
test("say: {name} is filled from values; an unknown {name} stays as written", () => {
  const say = makeSay("en", [depth, web, app]);
  assert.equal(say("web.x", { n: 17 }), "x 17");
  assert.equal(say("web.x", {}), "x {n}");
  assert.equal(say("web.x"), "x {n}");
});
test("say: the web's dictionary is over the terminal's, the shell's own over both", () => {
  const say = makeSay("ru", [{ ru: { k: "depth" } }, { ru: { k: "web" } }, { ru: { k: "app" } }]);
  assert.equal(say("k"), "app");
});
test("byLang: the two letters before .json name the language", () => {
  assert.deepEqual(Object.keys(byLang({ "../../web/src/locales/uk.json": {}, "x/ru.json": {} })).sort(), ["ru", "uk"]);
});

// The real files, read in place (the run script mounts them read-only).
const read = (dir: string) => byLang(Object.fromEntries(readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => [`${dir}/${f}`, JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))])));
test("the real dictionaries: every offered language names itself and has the splash's words", () => {
  const d = read("/repo/depth/ink/locales");
  const w = read("/repo/web/src/locales");
  const langs = languagesOf(d, w);
  assert.ok(langs.includes("ru") && langs.includes("en"));
  assert.ok(langs.length >= 15, `only ${langs.length} languages`);
  for (const lang of langs) {
    const say = makeSay(lang, [d, w]);
    for (const key of ["web.lang.self", "web.lang.title", "web.splash.tagline", "web.splash.vanishes", "web.splash.start", "web.splash.haveCode", "web.splash.arrive", "common.back"]) {
      assert.notEqual(say(key), key, `${lang}: no ${key} anywhere`);
    }
    assert.ok(w[lang]["web.lang.self"], `${lang}: no web.lang.self of its own`);
  }
});
