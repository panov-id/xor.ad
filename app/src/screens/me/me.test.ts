// "Me"'s pure part (me-logic.ts) and the band it stands on (depth/core/limits.ts ageBand, shared with the web's
// AgeFilter): the filter's track and what it sends, the step away's price, the sheets' dates and countries.
// scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ageBand } from "../../../../depth/core/limits.ts";
import { along, awayRows, countryName, dayMonth, filterPatch, filterRange, initial, meParent, moveHandle, noTop, rangeText, revisionDay } from "./me-logic.ts";

test("ageBand: ±2 from 13 up to 20, an open top from 21 with the bottom at most 21", () => {
  assert.deepEqual(ageBand(13), { low: 13, high: 15 });
  assert.deepEqual(ageBand(17), { low: 15, high: 19 });
  assert.deepEqual(ageBand(20), { low: 18, high: 22 });
  assert.deepEqual(ageBand(21), { low: 19, high: null });
  assert.deepEqual(ageBand(32), { low: 21, high: null });
});

test("filterRange: an adult's track is 21..41 (w4_age-filter: 25 and 35 sit at a fifth and seven tenths)", () => {
  const r = filterRange(32, 25, 35);
  assert.deepEqual(r, { min: 21, max: 41, from: 25, to: 35, open: true });
  assert.equal(along(r, r.from), 0.2);
  assert.equal(along(r, r.to), 0.7);
  assert.equal(rangeText(r), "25–35");
  assert.deepEqual(filterPatch(r), { filter_age_min: 25, filter_age_max: 35 });
});

test("filterRange: nothing kept is the whole band; an open top reads 21+ and sends null", () => {
  const r = filterRange(32);
  assert.equal(noTop(r), true);
  assert.equal(rangeText(r), "21+");
  assert.deepEqual(filterPatch(r), { filter_age_min: 21, filter_age_max: null });
});

test("filterRange: a teen's band is closed (no 'no limit'), and values outside it are pulled in", () => {
  const r = filterRange(16, 10, 30);
  assert.deepEqual(r, { min: 14, max: 18, from: 14, to: 18, open: false });
  assert.equal(noTop(r), false);
  assert.deepEqual(filterPatch(r), { filter_age_min: 14, filter_age_max: 18 });
});

test("moveHandle: a handle that goes past the other takes it along; the band holds both", () => {
  const r = filterRange(32, 25, 35);
  assert.deepEqual([moveHandle(r, "from", 38).from, moveHandle(r, "from", 38).to], [38, 38]);
  assert.deepEqual([moveHandle(r, "to", 22).from, moveHandle(r, "to", 22).to], [22, 22]);
  assert.equal(moveHandle(r, "to", 99).to, 41);
  assert.equal(moveHandle(r, "from", 5).from, 21);
});

test("awayRows: a talk that outlasts the break waits, one whose end comes first ends", () => {
  const now = 1_000_000;
  const rows = awayRows({ phrases: 2, likes: 5, ends: [now + 30 * 60, now + 2 * 3600, now + 86400] }, 60, now);
  assert.deepEqual(rows, { phrases: 2, likes: 5, wait: 2, end: 1 });
  assert.equal(awayRows({ phrases: 0, likes: 0, ends: [now + 30 * 60] }, 20, now).wait, 1);
});

test("dayMonth: the sheets' «12 Oct» in English, the day first in Russian; a revision date is that day everywhere", () => {
  assert.equal(dayMonth("en", new Date(2026, 9, 12, 12)), "12 Oct");
  assert.match(dayMonth("ru", new Date(2026, 9, 12, 12)), /^12 окт/);
  assert.equal(revisionDay("2026-10-14").getDate(), 14);
  assert.equal(dayMonth("en", revisionDay("2026-10-14")), "14 Oct");
});

test("countryName and initial", () => {
  assert.equal(countryName("en", "GE"), "Georgia");
  assert.equal(countryName("en", undefined), "");
  assert.equal(initial(" alex"), "A");
  assert.equal(initial(""), "?");
});

// Crowd run flow-1026-110213: at 320 «Изменить» was cut to «Измени» (a fixed-width text button). The prototype's «edit» is a
// round pen button with an aria-label (me.html), so no word can be cut. newdesign3 (28.10) puts it in the one head, .uhead:
// a 52 circle on the phone (frontend/components.css .btn-round), kept in kit.css as .k-uhead-btn and checked here.
test("«Edit» on Me is the kit's round pen button in the head: .k-uhead-btn in kit.css is 52 round, and Me.tsx labels it", () => {
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  const rule = /\.k-uhead-lead, \.k-uhead-btn \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /width: 52[p]x; height: 52[p]x/, ".k-uhead-btn lost the kit's 52 circle");
  assert.match(rule, /border-radius: 50%/, ".k-uhead-btn is no longer round");
  const me = readFileSync(new URL("./Me.tsx", import.meta.url), "utf8");
  assert.match(me, /className="k-uhead-btn" aria-label=\{say\("app\.me\.edit"\)\}/, "Me.tsx: the pen button has no label");
});

test("meParent: Back from a sub-page lands on the hub that holds its tile", () => {
  const want: Record<string, string | null> = { name: "hub-profile", age: "hub-profile", move: "hub-security", theme: "hub-profile", lang: "hub-profile", filter: "hub-visibility",
    hidden: "hub-visibility", blocked: "hub-visibility", pin: "hub-security", reissue: "hub-security", reset: "hub-security",
    "place-qr": "place", away: null, legal: null, statements: null, place: null };
  for (const [sub, hub] of Object.entries(want)) assert.equal(meParent(sub), hub, `Back from ${sub} goes to ${meParent(sub)}, not ${hub}`);
});

// change-pin.svg and lang.svg (coordinator 28.10, decided by the goal sosed = prototype): the sixth digit of the repeat
// saves the PIN with no Save button; a language is picked first and ✓ confirms (and reloads).
test("change-pin saves on the sixth digit; lang confirms with ✓", () => {
  const pin = readFileSync(new URL("./ChangePin.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pin, /data-testid="pin-go"/, "change-pin still has a Save button");
  assert.match(pin, /useEffect\(\(\) => \{ if \(ready\) void send\(\); \}, \[v\.again\]\)/, "change-pin: the sixth digit of the repeat does not save");
  const lang = readFileSync(new URL("./LangPicker.tsx", import.meta.url), "utf8");
  assert.match(lang, /onClick=\{\(\) => setPick\(lang\)\}/, "lang: a tap still reloads instead of picking");
  assert.match(lang, /onClick=\{\(\) => \{ if \(keep\(pick\)\) onBack\(\); \}\} data-testid="lang-go"/, "lang: no ✓ that confirms the pick");
});

// desktop me.svg (owner 28.10, from the coordinator): the 6th tile «i» is «About the app» and opens the Legal screen
test("Me at 1440: the sixth tile «About the app» opens Legal", () => {
  const me = readFileSync(new URL("./Me.tsx", import.meta.url), "utf8");
  assert.match(me, /\{wide && <Tile icon="info" [^>]*text=\{say\("app\.me\.about"\)\} testid="me-about" onOpen=\{\(\) => setSub\("legal"\)\} \/>\}/, "no «About the app» tile at 1440, or it does not open Legal");
});

// departure-1.svg (owner 28.10, from the coordinator): three tiles say what moves — phrases, talks, tables
test("departure-1 in the pane: three tiles — phrases, talks, tables", () => {
  const dep = readFileSync(new URL("../Departure.tsx", import.meta.url), "utf8");
  const tiles = /\{pane && <ul className="k-hub" data-hub="move" data-testid="move-what">([^]*?)<\/ul>\}/.exec(dep)?.[1] ?? "";
  assert.deepEqual([...tiles.matchAll(/"app\.move\.what_(\w+)"/g)].map((m) => m[1]), ["phrases", "talks", "tables"], "departure-1: the tiles are not phrases, talks, tables");
});

test("Reset: six digits typed before the counts came are sent when the counts come", () => {
  const src = readFileSync(new URL("./Reset.tsx", import.meta.url), "utf8");
  assert.ok(/useEffect\(\(\) => \{ if \(counts !== null && pin\.length === PIN_LENGTH && !busy\) void send\(pin\); \}, \[counts\]\)/.test(src),
    "Reset.tsx: no effect on [counts] that sends a full PIN — six digits typed early are never sent");
});

// desktop_1440 6-me: every sub-page opens in the right pane next to Me, none replaces Me at 1440.
// The set is read from Me.tsx's Sub type, so a new sub that is not routed through the pane fails here.
test("1440: every Sub of Me.tsx renders inside the pane, Me stays", () => {
  const src = readFileSync(new URL("./Me.tsx", import.meta.url), "utf8");
  const subs = [...(src.match(/export type Sub = ([^;]+);/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(subs.length >= 17, `Sub type read: ${subs.length}`);
  const routed = subs.filter((s) => new RegExp(`case "${s}":`).test(src));
  assert.deepEqual(routed, subs, `subs without a case: ${subs.filter((s) => !routed.includes(s)).join(",")}`);
  assert.match(src, /const shown: Sub \| null = desk \? sub \?\? "hub-profile" : sub;/, "with nothing open the pane shows the profile hub");
  assert.match(src, /if \(page && !desk\) return page;/, "only below 1440 a sub-page replaces Me");
  assert.match(src, /\{desk && page && <aside className="k-me-pane" data-testid="me-pane"/, "at 1440 the sub-page goes into the pane");
  assert.match(src, /case "away": return <StepAway client=\{client\} onGone=\{onAway\}/, "stepping away goes back to Me instead of the away screen");
  const away = readFileSync(new URL("../Away.tsx", import.meta.url), "utf8");
  assert.match(away, /if \(desk\) return \(\s*<SplitFrame name="away"/, "at 1440 the away screen is not the two-column frame of away.svg");
  // departure-1..3 in the pane, departure-done the frame of away.svg, edit-age its own page
  assert.match(src, /onMove=\{desk \? \(\) => setSub\("move"\) : onMove\}/, "at 1440 the move opens the new device's page instead of the pane");
  assert.match(src, /if \(desk && moved\) return <DepartureDone onGone=\{onMoved\} \/>;/, "at 1440 the finished move does not take the whole screen");
  assert.match(src, /case "age": return profile \? desk \? <EditAge /, "at 1440 the age tile does not open edit-age");
  assert.match(readFileSync(new URL("./Hubs.tsx", import.meta.url), "utf8"), /testid="me-age-tile" onOpen=\{\(\) => onGo\("age"\)\}/, "the age tile opens the name page");
  assert.match(src, /<EditName [^>]*noAge=\{desk\}/, "at 1440 edit-name still holds the age field (edit-name.svg: one field)");
  const dep = readFileSync(new URL("../Departure.tsx", import.meta.url), "utf8");
  assert.match(dep, /\{!pane && <Rail active="me" \/>\}/, "the departure in the pane draws a second rail");
  assert.match(dep, /<SplitFrame name="departure"/, "departure-done is not the two-column frame");
  assert.match(dep, /\{pane && <PinPad /, "departure-1 in the pane has no pad");
  assert.match(dep, /pane \? <Shown chars=\{out\.groups\} columns=\{3\} testid="move-code" \/>/, "departure-2 in the pane: the code is not three groups in a row");
  assert.match(dep, /pane \? \(\s*<div className="k-row"[^]*?className="k-icon-btn"[^]*?data-testid="move-no"[^]*?data-testid="move-yes"/, "departure-3 in the pane: not a round ✕ then a wide ✓ in one row");
  assert.match(dep, /if \(pane && !out && canOpen\(pin, busy\)\) void open\(\);/, "departure-1 in the pane: the sixth digit does not ask for the code");
  assert.match(src, /<InPane\.Provider value=\{true\}>\{page\}<\/InPane\.Provider>/, "the pane does not tell its sub-page it stands in the pane");
  assert.match(readFileSync(new URL("./parts.tsx", import.meta.url), "utf8"), /\{!pane && <Rail active="me" \/>\}/, "a sub-page in the pane draws a second rail");
});

// desktop-1440/1920 6-me edit-name.svg and away.svg (TAB23): at desk the name page has the big face above the field; away shows the door, its facts as lines
test("edit-name has the big face at desk", () => {
  const src = readFileSync(new URL("./EditName.tsx", import.meta.url), "utf8");
  assert.match(src, /\{desk && <span className="k-mark-110" style=\{\{ alignSelf: "center" \}\} aria-hidden="true"><NdIcon name="me" \/><\/span>\}/, "edit-name: no big face at desk");
});
test("away at desk shows the door and its facts as lines", () => {
  const src = readFileSync(new URL("../Away.tsx", import.meta.url), "utf8");
  assert.match(src, /SplitFrame name="away"[^\n]*mark=\{<NdIcon name="door" className="icon" \/>\} small=\{<NdIcon name="door" className="icon" \/>\} foot=\{cta\} facts=\{lines\}/, "away at desk: no door or no lines");
});
