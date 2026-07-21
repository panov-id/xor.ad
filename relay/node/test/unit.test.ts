// Unit tests for the pure node logic (no net/fs). Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { isEmail } from "../src/lib/http.ts";
import { sha256hex } from "../src/lib/hash.ts";
import { resolveBrand, welcomeEmail } from "../src/lib/welcome.ts";
import { brandByKey } from "../src/config.ts";
import { inc, render } from "../src/lib/metrics.ts";

const sosed = brandByKey("sosed")!;
const neighbro = brandByKey("neighbro")!;

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

Deno.test("resolveBrand maps source/host to a brand, defaults to primary", () => {
  assertEquals(resolveBrand("neighbro-landing").key, "neighbro");
  assertEquals(resolveBrand("https://api.neighbro.place").key, "neighbro");
  assertEquals(resolveBrand("sosed.place-landing").key, "sosed");
  assertEquals(resolveBrand("something-unknown").key, "sosed"); // primary fallback
  assertEquals(resolveBrand(null).key, "sosed");
});

Deno.test("welcome: localized + per-brand identity", () => {
  const ru = welcomeEmail("ru", { brand: sosed });
  assert(ru.subject.includes("сосед"));
  assert(!ru.subject.includes("Neighbro"));
  assert(ru.from.includes("sosed.place"));

  const en = welcomeEmail("en", { brand: neighbro });
  assert(en.subject.includes("Neighbro"));
  assert(en.from.includes("neighbro.place"));
  assert(en.html.includes("PSYTICAN"));
  assert(en.html.includes("NEIGHBRO")); // header wordmark
});

Deno.test("welcome: all 16 languages have their own subject", () => {
  const langs = ["en","ru","fr","de","es","el","uk","be","kk","ka","hy","az","uz","ky","tg","ro"];
  const subjects = new Set(langs.map((l) => welcomeEmail(l, { brand: sosed }).subject));
  assertEquals(subjects.size, langs.length);
});

Deno.test("welcome: unknown language falls back to en copy", () => {
  const unknown = welcomeEmail("zz", { brand: sosed });
  assertEquals(unknown.subject, welcomeEmail("en", { brand: sosed }).subject);
});

Deno.test("metrics render Prometheus counters with labels", () => {
  inc("relay_ut_total", { result: "ok" });
  inc("relay_ut_total", { result: "ok" });
  inc("relay_ut_total", { result: "fail" });
  const out = render();
  assert(out.includes("# TYPE relay_ut_total counter"));
  assert(out.includes('relay_ut_total{result="ok"} 2'));
  assert(out.includes('relay_ut_total{result="fail"} 1'));
});

Deno.test("jwt: sign/verify round-trip", async () => {
  const { sign, verify } = await import("../src/lib/jwt.ts");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await sign({ sub: "a@b.com", role: "admin", exp }, "s3cret");
  const claims = await verify(token, "s3cret");
  assertEquals(claims?.sub, "a@b.com");
  assertEquals(claims?.role, "admin");
});

Deno.test("jwt: rejects wrong secret and expired token", async () => {
  const { sign, verify } = await import("../src/lib/jwt.ts");
  const good = await sign({ sub: "a@b.com", role: "admin", exp: Math.floor(Date.now()/1000)+60 }, "k1");
  assertEquals(await verify(good, "k2"), null);                       // wrong key
  const expired = await sign({ sub: "a@b.com", role: "admin", exp: 1 }, "k1");
  assertEquals(await verify(expired, "k1"), null);                    // past exp
  assertEquals(await verify("not.a.jwt", "k1"), null);               // malformed
});
