// Unit tests for the pure node logic (no net/fs). Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { isEmail } from "../src/lib/http.ts";
import { sha256hex } from "../src/lib/hash.ts";
import { welcomeEmail } from "../src/lib/welcome.ts";

Deno.test("isEmail accepts/rejects", () => {
  assert(isEmail("me@example.com"));
  assert(isEmail("a.b+c@sub.example.co"));
  assert(!isEmail("nope"));
  assert(!isEmail("a@b")); // no TLD
  assert(!isEmail(123));
  assert(!isEmail("a@b." + "x".repeat(300))); // too long
});

Deno.test("sha256hex is stable and 64 hex chars (dedup key)", async () => {
  const h = await sha256hex("me@example.com");
  assertEquals(h.length, 64);
  assert(/^[0-9a-f]+$/.test(h));
  assertEquals(h, await sha256hex("me@example.com"));
  assert(h !== await sha256hex("other@example.com"));
});

Deno.test("welcome: localized + face-branded", () => {
  const ru = welcomeEmail("ru", { face: "sosed" });
  assert(ru.subject.includes("сосед"));
  assert(!ru.subject.includes("Neighbro"));
  assert(ru.from.includes("sosed.place"));

  const en = welcomeEmail("en", { face: "neighbro" });
  assert(en.subject.includes("Neighbro"));
  assert(en.from.includes("neighbro.place"));
  assert(en.html.includes("PSYTICAN"));
});

Deno.test("welcome: all 16 languages have their own subject", () => {
  const langs = ["en","ru","fr","de","es","el","uk","be","kk","ka","hy","az","uz","ky","tg","ro"];
  const subjects = new Set(langs.map((l) => welcomeEmail(l, { face: "sosed" }).subject));
  // en shares "сосед" brand but wording differs per language → all distinct
  assertEquals(subjects.size, langs.length);
});

Deno.test("welcome: unknown language falls back to en copy", () => {
  const unknown = welcomeEmail("zz", { face: "sosed" });
  assertEquals(unknown.subject, welcomeEmail("en", { face: "sosed" }).subject);
});
