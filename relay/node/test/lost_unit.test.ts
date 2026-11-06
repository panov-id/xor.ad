// The parts of routes/lost.ts that are a function of two numbers: the four
// steps of "when", the three-day dim, the ceilings the owner named (LOST_SPOTS
// §2, §4, §5). No database.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

configured("when is four steps, in the order the screen shows them", async () => {
  const { WHEN_STEPS } = await import("../src/routes/lost.ts");
  assertEquals([...WHEN_STEPS], ["now", "15m", "1h", "earlier"]);
});

configured("a mark dims after three days, not before", async () => {
  const { isDim, DIM_AFTER_DAYS } = await import("../src/routes/lost.ts");
  assertEquals(DIM_AFTER_DAYS, 3);
  const now = new Date("2026-11-02T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  assertEquals(isDim(new Date(now.getTime() - 3 * day + 1000), now), false, "dim a second short of three days");
  assertEquals(isDim(new Date(now.getTime() - 3 * day - 1000), now), true, "bright a second past three days");
  assertEquals(isDim(now, now), false);
});

configured("the ceilings are the owner's: three complaints as offers, a handful of marks a person", async () => {
  const lost = await import("../src/routes/lost.ts");
  const offers = await import("../src/routes/offer_complaints.ts");
  assertEquals(lost.TAKEDOWN_COMPLAINTS, offers.AUTOHIDE_COMPLAINTS, "a lost is not taken down by the offers' count");
  assert(lost.MARKS_PER_PERSON >= 1 && lost.MARKS_PER_PERSON <= 5);
  assertEquals(lost.WHERE_MAX_GRAPHEMES, 140);
});

configured("the public page and the signed routes are registered on the router", async () => {
  const { match } = await import("../src/lib/router.ts");
  await import("../src/routes/lost.ts");
  const id = crypto.randomUUID();
  for (const [method, path] of [["GET", `/l/${id}`], ["POST", `/feed/${id}/seen`], ["GET", `/feed/${id}/seen`], ["POST", `/feed/${id}/complaints`]]) {
    assert(match(method, path), `no route for ${method} ${path}`);
  }
});

configured("the anonymous key: an IPv6 by its /64, an IPv4 whole, a mapped IPv4 as the IPv4, junk untouched", async () => {
  const { addressKey } = await import("../src/routes/lost.ts");
  assertEquals(addressKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assertEquals(addressKey("2001:0db8:0001:0002::1"), "2001:db8:1:2::/64");
  assertEquals(addressKey("[2001:db8:1:2::1]"), "2001:db8:1:2::/64");
  assertEquals(addressKey("fe80::1%eth0"), "fe80:0:0:0::/64");
  assertEquals(addressKey("::1"), "0:0:0:0::/64");
  assertEquals(addressKey("203.0.113.7"), "203.0.113.7");
  assertEquals(addressKey("::ffff:203.0.113.7"), "203.0.113.7");
  assertEquals(addressKey("2001:db8::1::2"), "2001:db8::1::2");
  assertEquals(addressKey("unknown"), "unknown");
});

configured("the anonymous key is the same for one visitor in a day, differs by address, browser, language and day, and holds none of them", async () => {
  const { anonKey, dailySalt, utcDay } = await import("../src/routes/lost.ts");
  const req = (ip: string, ua = "Mozilla/5.0 Firefox/130", lang = "ru") =>
    new Request("https://relay.test/l/x/seen", { headers: { "x-forwarded-for": ip, "user-agent": ua, "accept-language": lang } });
  const today = new Date("2026-11-02T10:00:00Z");
  const a = await anonKey(req("2001:db8:1:2::1"), today);
  assert(/^[0-9a-f]{64}$/.test(a));
  assertEquals(await anonKey(req("2001:db8:1:2:ffff::9"), today), a, "another interface id in the /64 is another key");
  assert(await anonKey(req("2001:db8:1:3::1"), today) !== a, "another /64 is the same key");
  assert(await anonKey(req("2001:db8:1:2::1", "Chrome/130"), today) !== a, "another browser is the same key");
  assert(await anonKey(req("2001:db8:1:2::1", undefined, "en"), today) !== a, "another language is the same key");
  const tomorrow = new Date("2026-11-03T10:00:00Z");
  assert(await anonKey(req("2001:db8:1:2::1"), tomorrow) !== a, "the key did not change with the day");
  // The salt of the day gone is gone: yesterday's key cannot be made again.
  assertEquals(dailySalt(utcDay(tomorrow)), dailySalt(utcDay(tomorrow)));
  assert(dailySalt(utcDay(today)) !== undefined);
  assert(await anonKey(req("2001:db8:1:2::1"), today) !== a, "yesterday's salt was kept past the day");
  for (const raw of ["2001:db8", "Firefox", "ru"]) assert(!a.includes(raw));
});
