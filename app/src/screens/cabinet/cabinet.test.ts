// The advertiser's cabinet's pure part (depth/core/cabinet.ts), the offer link's reading (depth/core/offer_exit.ts), the
// router's offer path, and the cabinet's number forms in the shell's own words. scripts/run-app-unit-tests.sh, node:test,
// on UTC+14 (the clock tests build their days in local time).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  bareCode, clock, CODE_LENGTH, codeReady, dayAhead, DISCOUNT_MAX_DAYS, discountEnd, discountLabel, endProblem, inOrder, isCabinet, momentIn, MANY_COMPLAINTS,
  type Offer, offerFace, placeFrom, textLeft, tokenFromLink, type Venue, venueState, venueStep,
} from "../../../../depth/core/cabinet.ts";
import { codeOfPath, readExit } from "../../../../depth/core/offer_exit.ts";
import { makeSay, makeSayCount } from "../../i18n-core.ts";
import { pathOf, seatScreen } from "../../router.ts";

test("the envelope's code: capitals, no dash or spaces, twelve at most — what the node takes bare", () => {
  assert.equal(CODE_LENGTH, 12);
  assert.equal(bareCode("abcdef-ghjklm"), "ABCDEFGHJKLM");
  assert.equal(bareCode(" abc def\tghj klm "), "ABCDEFGHJKLM");
  assert.equal(bareCode("ABCDEFGHJKLMNPQ"), "ABCDEFGHJKLM");
  assert.equal(codeReady("ABCDEFGHJKL"), false);
  assert.equal(codeReady("ABCDEF-GHJKLM"), true);
  assert.equal(codeReady(""), false);
});

test("textLeft: graphemes as the node counts them (an emoji is one), never below zero (w4_cabinet-new-offer: 110 left)", () => {
  assert.equal(textLeft("Second round on us"), 110);
  assert.equal(textLeft(""), 128);
  assert.equal(textLeft("👍".repeat(3)), 125);
  assert.equal(textLeft("x".repeat(200)), 0);
});

test("placeFrom: nothing typed is no point; a pasted point takes the circle; anything else is bad", () => {
  assert.equal(placeFrom("  ", 300), null);
  assert.deepEqual(placeFrom("41.6900, 44.8010", 300), { lat: 41.69, lon: 44.801, area_radius: 300 });
  assert.deepEqual(placeFrom("41,69; 44,8", 1000), { lat: 41.69, lon: 44.8, area_radius: 1000 });
  assert.equal(placeFrom("somewhere", 300), "bad");
  assert.equal(placeFrom("91, 10", 300), "bad");
});

test("a discount's end is 23:00 of the chosen day; past, beyond 90 days, or no day are refused before the node", () => {
  const now = new Date(2026, 9, 18, 12, 0).getTime();
  assert.equal(discountEnd("2026-10-24")?.getHours(), 23);
  assert.equal(discountEnd("2026-10-24")?.getDate(), 24);
  assert.equal(discountEnd("24 Oct"), null);
  assert.equal(endProblem("2026-10-24", now), null);
  assert.equal(endProblem("2026-10-18", now), null);                       // tonight at 23:00 is still ahead at noon
  assert.equal(endProblem("2026-10-18", new Date(2026, 9, 18, 23, 30).getTime()), "past");
  assert.equal(endProblem("2026-10-17", now), "past");
  assert.equal(endProblem(dayAhead(DISCOUNT_MAX_DAYS - 1, now), now), null);
  assert.equal(endProblem(dayAhead(DISCOUNT_MAX_DAYS + 1, now), now), "far");
  assert.equal(endProblem("", now), "bad");
  assert.equal(dayAhead(6, now), "2026-10-24");
  assert.equal(clock(new Date(2026, 9, 18, 23, 0).toISOString()), "23:00");
});

test("discountLabel: the author's free text with one minus of ours, as the card writes it", () => {
  assert.equal(discountLabel("20%"), "−20%");
  assert.equal(discountLabel("-20%"), "−20%");
  assert.equal(discountLabel(" – 15% coffee "), "−15% coffee");
});

const offer = (over: Partial<Offer>): Offer => ({
  id: "o", venue_id: "v1", offer_text: "text", discount_value: "10%", conditions: null, promo_code: null, external_url: null, redirect_hits: 0,
  discount_until: new Date(2026, 9, 18, 23, 0).toISOString(), status: "active", published_at: "2026-10-18T10:00:00Z", expires_at: "2026-10-18T20:00:00Z",
  link: "", link_disabled: false, ...over,
});

test("offerFace: a live offer is the big card, an expired one the line with its counts; many complaints are told", () => {
  const names = new Map([["v1", "Khinkali Bar"]]);
  const live = offerFace(offer({ discount_value: "20%", offer_text: "On the second dozen" }), names);
  assert.deepEqual([live.live, live.big, live.text, live.venue, live.until], [true, "−20%", "On the second dozen", "Khinkali Bar", "23:00"]);
  const done = offerFace(offer({ status: "expired", redirect_hits: 48, complaints: 0, venue_id: "gone" }), names);
  assert.deepEqual([done.live, done.visits, done.complaints, done.venue, done.many], [false, 48, 0, "", false]);
  assert.equal(offerFace(offer({ complaints: MANY_COMPLAINTS }), names).many, true);
  assert.equal(offerFace(offer({ complaints: MANY_COMPLAINTS - 1 }), names).many, false);
});

test("inOrder: live offers first, each group newest first; the list given is not changed", () => {
  const list = [
    offer({ id: "old-expired", status: "expired", published_at: "2026-10-01T00:00:00Z" }),
    offer({ id: "old-live", published_at: "2026-10-10T00:00:00Z" }),
    offer({ id: "new-expired", status: "expired", published_at: "2026-10-12T00:00:00Z" }),
    offer({ id: "new-live", published_at: "2026-10-17T00:00:00Z" }),
  ];
  assert.deepEqual(inOrder(list).map((o) => o.id), ["new-live", "old-live", "new-expired", "old-expired"]);
  assert.equal(list[0].id, "old-expired");
});

test("a venue's step: the code once the envelope is ordered, the order before it, nothing once it is proved or suspended", () => {
  const v = (verification_status: string, envelope_expires_at: string | null): Pick<Venue, "verification_status" | "envelope_expires_at"> => ({ verification_status, envelope_expires_at });
  assert.equal(venueStep(v("unverified", null)), "order");
  assert.equal(venueStep(v("unverified", "2026-11-01T00:00:00Z")), "code");
  assert.equal(venueStep(v("verified", null)), "done");
  assert.equal(venueStep(v("suspended", "2026-11-01T00:00:00Z")), "done");
  assert.equal(venueState("verified"), "verified");
  assert.equal(venueState("suspended"), "suspended");
  assert.equal(venueState("whatever the node adds"), "unverified");
});

test("the cabinet's page and its sign-in link: the token rides in the fragment, a mangled one is told apart from no link", () => {
  assert.equal(isCabinet("adv.sosed.place", "/"), true);
  assert.equal(isCabinet("localhost", "/adv"), true);
  assert.equal(isCabinet("localhost", "/adv/enter"), true);
  assert.equal(isCabinet("localhost", "/advice"), false);
  assert.equal(isCabinet("sosed.place", "/feed"), false);
  const token = "ab".repeat(32);
  assert.equal(tokenFromLink("/adv/enter", `#${token}`), token);
  assert.equal(tokenFromLink("/enter/", `#${token}`), token);
  assert.equal(tokenFromLink("/adv/enter", "#short"), "");
  assert.equal(tokenFromLink("/adv/enter", ""), "");
  assert.equal(tokenFromLink("/adv", `#${token}`), null);
});

test("momentIn: «18 October, 23:00» in the language asked", () => {
  const at = new Date(2026, 9, 18, 23, 0).toISOString();
  assert.equal(momentIn("en", at), "October 18, 23:00");
  assert.match(momentIn("ru", at), /^18 октября, 23:00$/);
  assert.equal(momentIn("en", null), "?");
  assert.equal(momentIn("en", "not a date"), "?");
});

const fakeFetch = (status: number, body?: unknown) => (async () => ({ status, json: async () => body })) as unknown as typeof fetch;
test("readExit: the domain and whether the link is off; 404 is no such link; a bad code never asks the node", async () => {
  assert.deepEqual(await readExit("abc123", fakeFetch(200, { domain: "puri.ge", disabled: false })), { at: "ok", exit: { domain: "puri.ge", disabled: false } });
  assert.deepEqual(await readExit("abc123", fakeFetch(404)), { at: "missing" });
  assert.deepEqual(await readExit("abc123", fakeFetch(503)), { at: "failed" });
  assert.deepEqual(await readExit("abc123", fakeFetch(200, { domain: 7 })), { at: "failed" });
  assert.deepEqual(await readExit("abc123", (async () => { throw new Error("offline"); }) as unknown as typeof fetch), { at: "failed" });
  let asked = 0;
  const counting = (async () => { asked++; return { status: 200, json: async () => ({}) }; }) as unknown as typeof fetch;
  assert.deepEqual(await readExit("a/b", counting), { at: "missing" });
  assert.equal(asked, 0);
});

test("the offer link's path: /o/<code> is the exit screen, for a seat and for the router's address", () => {
  assert.equal(codeOfPath("/o/abc123"), "abc123");
  assert.equal(codeOfPath("/o/abc123/"), "abc123");
  assert.equal(codeOfPath("/o/abc123/go"), null);
  assert.equal(codeOfPath("/o"), null);
  assert.deepEqual(seatScreen("/o/abc123"), { at: "offer", code: "abc123" });
  assert.equal(pathOf({ at: "offer", code: "abc123" }), "/o/abc123");
  assert.deepEqual(seatScreen("/o/abc123/go"), { at: "feed" });
});

// The cabinet's numbers agree with their nouns: read from the shell's own dictionary (app/src/i18n.ts), as the screens say them.
function appWords(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let lang: string | null = null;
  for (const line of readFileSync("/repo/app/src/i18n.ts", "utf8").split("\n")) {
    const l = line.match(/^  ([a-z]{2}): \{/);
    if (l) { lang = l[1]; out[lang] = {}; continue; }
    if (/^  \},?$/.test(line)) { lang = null; continue; }
    const k = line.match(/^\s+"(app\.(?:cabinet|offer)\.[^"]+)": ("(?:[^"\\]|\\.)*"),?$/);
    if (lang && k) out[lang][k[1]] = JSON.parse(k[2]);
  }
  return out;
}
test("the cabinet's counts: the letters left and the tries left take the form their language writes", () => {
  const app = appWords();
  const ru = makeSayCount("ru", makeSay("ru", [app]));
  const en = makeSayCount("en", makeSay("en", [app]));
  assert.deepEqual([1, 2, 5, 21, 110].map((n) => ru("app.cabinet.left", n)), ["остался 1", "осталось 2", "осталось 5", "остался 21", "осталось 110"]);
  assert.deepEqual([1, 2, 5, 11, 21].map((n) => ru("app.cabinet.tries", n)), ["Осталась 1 попытка.", "Осталось 2 попытки.", "Осталось 5 попыток.", "Осталось 11 попыток.", "Осталась 21 попытка."]);
  assert.equal(en("app.cabinet.left", 110), "110 left");
  assert.deepEqual([0, 1, 4].map((n) => en("app.cabinet.tries", n)), ["0 tries left.", "1 try left.", "4 tries left."]);
  // English falls back to the Russian word for a key it lacks (say's rule), so every plain key of the cabinet and the forms English uses must be written in English
  for (const key of Object.keys(app.ru)) if (!/\.(few|many)$/.test(key)) assert.ok(key in app.en, `${key} has no English line`);
});
