// The register screens' rules (depth/core/register.ts, the SDK's, shared with the web), as the app reads them,
// the app's own words, and the capital the sheets set labels with. scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { capital } from "../i18n-core.ts";
import { ageDigits, groupsMatch, layOutGroups, pinsDiffer, refusalOf, whyGroups, whyNext, whyPin } from "../../../depth/core/register.ts";

test("step one: the reason named first is the first thing missing", () => {
  assert.equal(whyNext({ name: "", age: "", consent: false }), "name");
  assert.equal(whyNext({ name: "Alex", age: "", consent: false }), "age");
  assert.equal(whyNext({ name: "Alex", age: "12", consent: true }), "young");
  assert.equal(whyNext({ name: "Alex", age: "13", consent: false }), "consent");
  assert.equal(whyNext({ name: "Alex", age: "13", consent: true }), null);
  assert.equal(ageDigits("1a2b3c4"), "123");
});
test("step two: a matching six opens it; different sixes say so", () => {
  assert.equal(whyPin("483915", "483915"), null);
  assert.equal(whyPin("483915", "483916"), "pin_differ");
  assert.equal(pinsDiffer("483915", "483916"), true);
  assert.equal(whyPin("48391", "48391"), "pin");
});
test("step three: the sheet keeps done dimmed until both groups are four long; the web's rule (anything typed) is the default", () => {
  assert.equal(whyGroups("2XWD", "9FT", true), "groups");
  assert.equal(whyGroups("2XWD", "9FTE", true), null);
  assert.equal(whyGroups("2xw-d", "9 fte", true), null); // read as the paper reads it before it is counted
  assert.equal(whyGroups("2XWD", "9", false), null);
  assert.equal(whyGroups("", "9FTE", false), "groups");
});
test("step three: the groups typed back are the code's second and fourth", () => {
  const groups = ["K7QM", "2XWD", "PE4R", "9FTE"];
  assert.equal(groupsMatch(groups, "2xwd", "9fte"), true);
  assert.equal(groupsMatch(groups, "9FTE", "2XWD"), false);
  assert.deepEqual(layOutGroups(["", ""], 0, "2XWD", [2, 4]), { next: ["2XWD", ""], focus: 1 });
});
test("a refusal: 429 the limit, a number for another status, anything else failed", () => {
  assert.equal(refusalOf(new Error("registration refused: 429 {}")).kind, "limit");
  assert.deepEqual(refusalOf(new Error("registration refused: 502 <html>")), { kind: "refused", status: "502" });
  assert.equal(refusalOf(new TypeError("Failed to fetch")).kind, "failed");
});
test("capital: the first letter only, by the language's rules", () => {
  assert.equal(capital("repeat the PIN", "en"), "Repeat the PIN");
  assert.equal(capital("готово", "ru"), "Готово");
  assert.equal(capital("istanbul", "tr"), "İstanbul");
  assert.equal(capital("", "en"), "");
  assert.equal(capital("👍 ok", "en"), "👍 ok");
});

// The words the screens ask for: each key exists (the web's, the terminal's or the app's own), and the app's own have ru and en.
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const screens = src("./Register.tsx") + src("./register-parts.tsx") + src("./Unlock.tsx") + src("./Locked.tsx") + src("./pin-line.ts");
const i18n = src("../i18n.ts");
const appKeys = (lang: "ru" | "en") => {
  const block = i18n.slice(i18n.indexOf(`  ${lang}: {`));
  return new Set([...block.slice(0, block.indexOf("\n  },")).matchAll(/"(app\.[a-z0-9_.]+)":/g)].map((m) => m[1]));
};
const locale = (dir: string, lang: string): Record<string, string> => JSON.parse(readFileSync(`/repo/${dir}/${lang}.json`, "utf8"));
test("the screens' words: every key used exists; the app's own have ru and en alike", () => {
  const used = [...screens.matchAll(/\b(?:say|label)\("([a-z][a-z0-9_.]+)"/g)].map((m) => m[1]);
  // keys built in code: why_<reason>, the three documents' names and short words
  const built = ["name", "age", "young", "consent", "pin", "pin_differ", "groups"].map((w) => `web.register.why_${w}`)
    .concat(["terms", "privacy", "guidelines"].flatMap((d) => [`web.legal.${d}`, `web.legal.short.${d}`]));
  assert.ok(used.length > 15, `only ${used.length} keys found in the screens`);
  const ru = appKeys("ru"), en = appKeys("en");
  assert.deepEqual([...ru].sort(), [...en].sort(), "the app's own words differ between ru and en");
  for (const key of new Set([...used, ...built])) {
    if (key.startsWith("app.")) { assert.ok(ru.has(key) && en.has(key), `${key}: not in the app's own ru and en`); continue; }
    for (const lang of ["ru", "en"]) {
      const words = { ...locale("depth/ink/locales", lang), ...locale("web/src/locales", lang) };
      assert.ok(key in words, `${lang}: no ${key}`);
    }
  }
});
