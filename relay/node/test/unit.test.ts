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

Deno.test("welcome: per-brand palette, accent and shape", () => {
  // sosed: terra default accent, rounded card, sosed dark background
  const s = welcomeEmail("ru", { brand: sosed });
  assert(s.html.includes("#d6552f")); // terra
  assert(s.html.includes("border-radius:14px"));
  assert(s.html.includes("background:#0d0b0a")); // sosed dark bg
  assert(s.html.includes("img/splash.jpg")); // warm courtyard hero

  // sosed light mode + explicit accent
  const sl = welcomeEmail("ru", { brand: sosed, accent: "amber", mode: "light" });
  assert(sl.html.includes("#d68a1f")); // amber
  assert(sl.html.includes("background:#ece4d8")); // sosed light bg

  // sosed teal uses the sosed hex, not the neighbro one
  const st = welcomeEmail("ru", { brand: sosed, accent: "teal" });
  assert(st.html.includes("#1fa99a"));
  assert(!st.html.includes("#1fb39a"));

  // neighbro: gold default (empty accent from the landing), brutalist card
  const n = welcomeEmail("en", { brand: neighbro, accent: "" });
  assert(n.html.includes("#c6a24e")); // gold
  assert(n.html.includes("border-radius:0"));
  assert(n.html.includes("background:#0c0b09")); // neighbro dark bg
  assert(n.html.includes("img/hero.jpg")); // neighbro keeps the facade hero

  // unknown accent falls back to the brand default
  const u = welcomeEmail("en", { brand: sosed, accent: "nope" });
  assert(u.html.includes("#d6552f"));
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

// The quota's arithmetic, without a database: what "today" means and what a
// caller who ran out is told to do about it.
Deno.test("quota: the day is UTC, not the node's timezone", async () => {
  const { utcDay } = await import("../src/lib/quota.ts");
  // A pool spans regions; a per-node local day would let a key spend its
  // allowance twice by crossing midnight in two places.
  assertEquals(utcDay(new Date("2026-07-28T23:59:59Z")), "2026-07-28");
  assertEquals(utcDay(new Date("2026-07-29T00:00:01Z")), "2026-07-29");
});

Deno.test("quota: the reset is a number of seconds, never zero", async () => {
  const { secondsUntilReset } = await import("../src/lib/quota.ts");
  assertEquals(secondsUntilReset(new Date("2026-07-28T00:00:00Z")), 86400);
  assertEquals(secondsUntilReset(new Date("2026-07-28T23:59:30Z")), 30);
  // A Retry-After of 0 invites an immediate retry into the same refusal.
  assert(secondsUntilReset(new Date("2026-07-28T23:59:59.900Z")) >= 1);
});

Deno.test("quota: no limit and no database mean no refusal", async () => {
  const { exceeded } = await import("../src/lib/quota.ts");
  // null is what every key has until someone sets an allowance, and the tests
  // run without DATABASE_URL — both paths must let traffic through.
  assertEquals(await exceeded("ak_pub_whatever", null), false);
  assertEquals(await exceeded("ak_pub_whatever", 1), false);
});

Deno.test("jwt: sign/verify round-trip", async () => {
  const { sign, verify } = await import("../src/lib/jwt.ts");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await sign({ sub: "a@b.com", role: "admin", brand: null, exp }, "s3cret");
  const claims = await verify(token, "s3cret");
  assertEquals(claims?.sub, "a@b.com");
  assertEquals(claims?.role, "admin");
});

// The counter's privacy is these two functions: everything a visitor's browser
// offers that could identify them is reduced here, before anything is stored.
Deno.test("pageview: the referrer is reduced to its host", async () => {
  const { referrerHost } = await import("../src/routes/pageview.ts");
  // A search query lives in the referrer's query string — the reason only the
  // host is kept.
  assertEquals(referrerHost("https://www.google.com/search?q=secret+thing"), "www.google.com");
  assertEquals(referrerHost("https://t.me/somechannel/42"), "t.me");
  assertEquals(referrerHost(""), null);
  // Parses, and its "host" is a package name — dropped, or app installs would
  // show up as a referring site.
  assertEquals(referrerHost("android-app://com.example"), null);
  assertEquals(referrerHost("not a url"), null);
  assertEquals(referrerHost(42), null);
});

Deno.test("pageview: the viewport becomes a bucket, not a measurement", async () => {
  const { viewport } = await import("../src/routes/pageview.ts");
  assertEquals(viewport(390), "mobile");
  assertEquals(viewport(834), "tablet");
  assertEquals(viewport(1920), "desktop");
  assertEquals(viewport(0), null);
  assertEquals(viewport("1920"), null);
  assertEquals(viewport(Number.NaN), null);
});

// The prune deletes without reading, so what it selects is the whole safety
// argument: an entry the transport could not date must survive.
Deno.test("prune: only dated entries older than the cutoff are selected", async () => {
  const { expiredEntries } = await import("../tools/prune_pageviews.ts");
  const entries = [
    { name: "old.json", createdAt: "2026-01-01T00:00:00.000Z", size: 1 },
    { name: "edge.json", createdAt: "2026-07-01T00:00:00.000Z", size: 1 }, // exactly the cutoff
    { name: "fresh.json", createdAt: "2026-07-20T00:00:00.000Z", size: 1 },
    { name: "undated.json", createdAt: "", size: 1 },
  ];
  const expired = expiredEntries(entries, "2026-07-01T00:00:00.000Z");
  assertEquals(expired.map((entry) => entry.name), ["old.json"]);
});

Deno.test("jwt: rejects wrong secret and expired token", async () => {
  const { sign, verify } = await import("../src/lib/jwt.ts");
  const good = await sign({ sub: "a@b.com", role: "admin", brand: null, exp: Math.floor(Date.now()/1000)+60 }, "k1");
  assertEquals(await verify(good, "k2"), null);                       // wrong key
  const expired = await sign({ sub: "a@b.com", role: "admin", brand: null, exp: 1 }, "k1");
  assertEquals(await verify(expired, "k1"), null);                    // past exp
  assertEquals(await verify("not.a.jwt", "k1"), null);               // malformed
});
