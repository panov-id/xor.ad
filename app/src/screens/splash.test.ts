// The splash's language logic (i18n-core.ts): pick, keep, the list passed once. node:test, no DOM.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseLanguage, chosenLanguage, keepLanguage, languageAsked, languageName, pickLanguage, type Store } from "../i18n-core.ts";

const LANGS = ["de", "en", "ru", "uk"];
const memory = (init: Record<string, string> = {}): Store & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const throwing: Store = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("pickLanguage: a chosen language wins over the browser", () => {
  assert.equal(pickLanguage(LANGS, ["de-DE"], "uk"), "uk");
});
test("pickLanguage: the browser's first known language, region cut, case folded", () => {
  assert.equal(pickLanguage(LANGS, ["xx-YY", "DE-at", "en"], null), "de");
});
test("pickLanguage: nothing known is Russian", () => {
  assert.equal(pickLanguage(LANGS, ["xx", "yy"], null), "ru");
  assert.equal(pickLanguage(LANGS, [], null), "ru");
});

test("chosenLanguage: only a language we speak counts; throwing or missing storage is no choice", () => {
  assert.equal(chosenLanguage(LANGS, memory({ lang: "uk" })), "uk");
  assert.equal(chosenLanguage(LANGS, memory({ lang: "zz" })), null);
  assert.equal(chosenLanguage(LANGS, memory()), null);
  assert.equal(chosenLanguage(LANGS, throwing), null);
  assert.equal(chosenLanguage(LANGS, null), null);
});

test("languageAsked: false only on a device that kept nothing; blocked storage never holds the list", () => {
  assert.equal(languageAsked(memory()), false);
  assert.equal(languageAsked(memory({ "lang-asked": "1" })), true);
  assert.equal(languageAsked(throwing), true);
  assert.equal(languageAsked(null), true);
});

test("keepLanguage: the page's own language is kept without a reload", () => {
  const store = memory();
  let reloads = 0;
  const done = keepLanguage("ru", { languages: LANGS, current: "ru", store, reload: () => { reloads++; } });
  assert.equal(done, true);
  assert.equal(reloads, 0);
  assert.equal(store.data["lang-asked"], "1");
  assert.equal(store.data["lang"], undefined);
});
test("keepLanguage: another language is stored, the list is passed, the page reloads", () => {
  const store = memory();
  let reloads = 0;
  const done = keepLanguage("uk", { languages: LANGS, current: "ru", store, reload: () => { reloads++; } });
  assert.equal(done, false);
  assert.equal(reloads, 1);
  assert.equal(store.data["lang"], "uk");
  assert.equal(store.data["lang-asked"], "1");
});
test("keepLanguage: storage that throws must not hold the person on the list", () => {
  let reloads = 0;
  const done = keepLanguage("uk", { languages: LANGS, current: "ru", store: throwing, reload: () => { reloads++; } });
  assert.equal(done, true); // no reload, the splash opens in the page's language
  assert.equal(reloads, 0);
});
test("chooseLanguage: an unknown language or the current one changes nothing", () => {
  let reloads = 0;
  const d = { languages: LANGS, current: "ru", store: memory(), reload: () => { reloads++; } };
  assert.equal(chooseLanguage("zz", d), false);
  assert.equal(chooseLanguage("ru", d), false);
  assert.equal(reloads, 0);
});

test("languageName: a language is named in itself; the code, upper-cased, when nothing names it", () => {
  const web = { ru: { "web.lang.self": "Русский" }, de: {} };
  assert.equal(languageName(web, "ru"), "Русский");
  assert.equal(languageName(web, "zz"), "ZZ");
});
