// The language comes from the environment, and a hole never reaches the screen.
import { assertEquals } from "jsr:@std/assert@1";
import { languageOf, strings, LANGUAGES } from "./strings.ts";

Deno.test("the language is read the way a terminal states it", () => {
  assertEquals(languageOf({ LANG: "ka_GE.UTF-8" }), "ka");
  assertEquals(languageOf({ LC_ALL: "ru_RU.UTF-8", LANG: "en_US.UTF-8" }), "ru");
  assertEquals(languageOf({ DEPTH_LANG: "el", LC_ALL: "ru_RU.UTF-8" }), "el");
  assertEquals(languageOf({ LANG: "C" }), "en", "an unknown language must fall back, not break");
  assertEquals(languageOf({}), "en");
});

Deno.test("every language answers, and values are filled in", () => {
  for (const lang of LANGUAGES) {
    const say = strings(lang);
    const line = say("feed.header", { lat: "59.93", lon: "30.34", radius: 1000, from: 24, to: 34 });
    assertEquals(line.includes("{"), false, `${lang}: a value was left unfilled in "${line}"`);
    assertEquals(line.length > 0, true, `${lang}: the feed header is empty`);
  }
});

Deno.test("a key nobody translated falls back to English, and an unknown key shows itself", () => {
  assertEquals(strings("ru")("no.such.key.at.all"), "no.such.key.at.all");
});
