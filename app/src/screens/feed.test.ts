// The feed's pure part (screens/feed-logic.ts) and the place it looks at (place.ts).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { placeOf } from "../place.ts";
import { offerReportUrl } from "./feed-logic.ts";
import { ownFade, ownFaded, ownLeft, cardEntry, cardOf, feedRows, matchesQuery, peerName, sentOf, stepKey, stepOf, STEPS, takedownVerdict, withoutCard, type FeedCard, type Gone, likeOutcome, matchOf, mergePage, offerLabel, RADII, radiusWord, toneOf, UNDO_HIDE_MS, visibleCards, widenedTo, widerRadius, withLike, withoutLike, ownLive } from "./feed-logic.ts";

const c = (id: string, extra: Partial<FeedCard> = {}): FeedCard => ({ id, text: `t${id}`, mode: "alone", lang: "und", like_count: 0, ...extra });

test("widerRadius: the next circle, null at the widest, null for a radius the list does not have", () => {
  assert.equal(widerRadius(100), 300);
  assert.equal(widerRadius(1000), 3000);
  assert.equal(widerRadius(10000), null);
  assert.equal(widerRadius(7 as never), null);
  assert.deepEqual(RADII, [100, 300, 1000, 3000, 10000]);
});

test("radiusWord: metres below a kilometre, kilometres from it", () => {
  assert.deepEqual(radiusWord(300), { key: "web.feed.m", n: 300 });
  assert.deepEqual(radiusWord(1000), { key: "web.feed.km", n: 1 });
  assert.deepEqual(radiusWord(10000), { key: "web.feed.km", n: 10 });
});

test("visibleCards: a table is not drawn, the card that left is gone, the rest keep their order", () => {
  const items = [c("1"), c("2", { kind: "table" }), c("3"), c("4")];
  assert.deepEqual(visibleCards(items, null).map((x) => x.id), ["1", "3", "4"]);
  const gone: Gone = { why: "hidden", id: "3", handle: "h" };
  assert.deepEqual(visibleCards(items, gone).map((x) => x.id), ["1", "4"]);
});

test("mergePage: the first page replaces, a page after the cursor joins, a card on both pages is drawn once", () => {
  const first = [c("1"), c("2")];
  assert.deepEqual(mergePage([c("9")], first).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(mergePage(first, [c("2"), c("3")], "cursor").map((x) => x.id), ["1", "2", "3"]);
});

test("toneOf: lime, yellow, peach in turn; an offer is coral", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => toneOf(c("x"), i)), ["lime", "yellow", "peach", "lime", "yellow"]);
  assert.equal(toneOf(c("x", { offer: { discount_value: "20 %" } }), 0), "coral");
  assert.equal(toneOf(c("x", { kind: "offer" }), 1), "coral");
});

test("offerLabel: any leading minus is dropped, ours is added", () => {
  for (const given of ["20 %", "-20 %", "−20%", "– 20%"]) assert.match(offerLabel(given), /^−\d/);
  assert.equal(offerLabel("-20 %"), "−20 %");
});

test("likeOutcome: 200 liked, 200 matched with the match, 409 stepped_away, 429 rapid, anything else other", () => {
  assert.deepEqual(likeOutcome(200, { state: "liked" }), { state: "liked" });
  assert.deepEqual(likeOutcome(200, null), { state: "liked" });
  assert.deepEqual(likeOutcome(200, { state: "matched", match_id: "m1" }), { state: "matched", matchId: "m1" });
  assert.deepEqual(likeOutcome(409, { error: { code: "stepped_away" } }), { state: "refused", cause: "stepped_away", status: 409 });
  assert.deepEqual(likeOutcome(409, { error: { code: "no_phrase" } }), { state: "refused", cause: "other", status: 409 });
  assert.deepEqual(likeOutcome(429, undefined), { state: "refused", cause: "rapid", status: 429 });
  assert.deepEqual(likeOutcome(500, "boom"), { state: "refused", cause: "other", status: 500 });
});

test("matchOf: a feed row's match_id opens the card as matched, as a like's answer would; no id, no outcome", () => {
  assert.deepEqual(matchOf(c("1", { match_id: "m1" })), { state: "matched", matchId: "m1" });
  assert.equal(matchOf(c("1")), null);
  assert.equal(matchOf({ match_id: "" }), null);
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /useState<LikeOutcome \| null>\(\(\) => matchOf\(card\)\)/, "feed-card.tsx: the card does not open on the row's match");
});

test("withLike: the card takes one like once, and a liked one stays as it was", () => {
  const once = withLike(c("1", { like_count: 4 }));
  assert.equal(once.like_count, 5);
  assert.equal(once.liked, true);
  assert.equal(withLike(once).like_count, 5);
});

test("the hidden row stands five seconds", () => {
  assert.equal(UNDO_HIDE_MS, 5000);
});

test("placeOf: the web's stored place is read as it is; anything else is no place", () => {
  assert.deepEqual(placeOf('{"lat":41.7,"lon":44.8,"name":"Tbilisi","cc":"GE","source":"city"}'), { lat: 41.7, lon: 44.8, name: "Tbilisi", chosen: true });
  assert.equal(placeOf(null), null);
  assert.equal(placeOf("not json"), null);
  assert.equal(placeOf('{"lat":"41","lon":44,"name":"x"}'), null);
  assert.equal(placeOf('{"lat":41,"lon":44}'), null);
});

test("cardEntry/cardOf: an open card is one history entry deeper and names its card; any other entry names none", () => {
  const e = cardEntry({ gate: "feed", i: 0 }, "p1");
  assert.deepEqual(e, { gate: "feed", i: 1, card: "p1" });
  assert.equal(cardOf(e), "p1");
  assert.equal(cardOf({ gate: "feed", i: 0 }), null);
  assert.equal(cardOf(null), null);
  assert.equal(cardOf({ card: "" }), null);
  assert.deepEqual(cardEntry(null, "p2"), { gate: "feed", i: 1, card: "p2" });
});

test("withoutCard: a stale card entry keeps its place in history but names no card; other entries pass as they are", () => {
  assert.deepEqual(withoutCard({ gate: "feed", i: 1, card: "p1" }), { gate: "feed", i: 1 });
  const plain = { gate: "feed", i: 0 };
  assert.equal(withoutCard(plain), plain);
  assert.equal(withoutCard(null), null);
});

test("matchesQuery: case and edge spaces do not matter, an empty query holds all, a table is found by its name", () => {
  assert.equal(matchesQuery(c("1", { text: "Backgammon in the yard" }), "  BACK "), true);
  assert.equal(matchesQuery(c("1", { text: "Backgammon in the yard" }), "ladder"), false);
  assert.equal(matchesQuery(c("1"), "   "), true);
  assert.equal(matchesQuery(c("2", { kind: "table", text: "", name: "Evening at the yard" }), "evening"), true);
  assert.equal(matchesQuery(c("2", { kind: "table", text: "yard", name: null }), "yard"), false);
});

test("feedRows: tables stay between the phrases, the tones count phrases only, the gone card and the search drop rows", () => {
  const items = [c("1"), c("2", { kind: "table", name: "T" }), c("3"), c("4"), c("5")];
  const rows = feedRows(items, null);
  assert.deepEqual(rows.map((r) => r.card.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(rows.map((r) => r.tone), ["lime", null, "yellow", "peach", "lime"]);
  assert.deepEqual(feedRows(items, { why: "blocked", id: "3" }).map((r) => [r.card.id, r.tone]), [["1", "lime"], ["2", null], ["4", "yellow"], ["5", "peach"]]);
  assert.deepEqual(feedRows([c("1", { text: "cat" }), c("2", { text: "dog" }), c("3", { kind: "table", name: "cat table" })], null, "cat").map((r) => r.card.id), ["1", "3"]);
});

test("stepOf: a step of the contract only, on 200 only; the word for it is web.nearby.<step>", () => {
  for (const s of STEPS) assert.equal(stepOf(200, { step: s }), s);
  assert.equal(stepOf(200, { step: "dozens" }), null);
  assert.equal(stepOf(200, { step: 12 }), null);
  assert.equal(stepOf(200, null), null);
  assert.equal(stepOf(429, { step: "tens" }), null);
  assert.equal(stepKey("about_ten"), "web.nearby.about_ten");
});

test("sentOf and takedownVerdict: the id stays only when the node gave one; only 204 is a phrase taken down", () => {
  assert.deepEqual(sentOf({ state: "published", id: "p1" }, "hi"), { state: "published", text: "hi", id: "p1" });
  assert.deepEqual(sentOf({ state: "checking", id: "" }, "hi"), { state: "checking", text: "hi" });
  assert.deepEqual(takedownVerdict(204), { ok: true });
  assert.deepEqual(takedownVerdict(404), { ok: false, status: 404 });
  assert.deepEqual(takedownVerdict(0), { ok: false, status: 0 });
});

test("peerName: the match's own row by the like's match id; a chat with the same id, a blank name or no id say nothing", () => {
  const rows = [{ kind: "chat", id: "m1", name: "Dato" }, { kind: "match", id: "m1", name: "Nino" }, { kind: "match", id: "m2", name: "  " }];
  assert.equal(peerName(rows, "m1"), "Nino");
  assert.equal(peerName(rows, "m2"), null);
  assert.equal(peerName(rows, "m9"), null);
  assert.equal(peerName(rows, undefined), null);
});

// Owner 2026-10-26 (crowd run flow-1026-125809): on a desktop the phrase had no «…», so no report, hide or block.
test("no width hides the phrase's «…»: report, hide and block have no other way in", () => {
  const dir = new URL("../../tokens/", import.meta.url), files = readdirSync(dir).filter((f) => f.endsWith(".css"));
  assert.ok(files.length >= 10, `only ${files.length} token stylesheets found`);
  const css = files.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  // the «…» is the archive's head of the card (nd4/screens/card-in.gen.tsx, data-testid more-menu), and every card draws that head
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  const gen = readFileSync(new URL("../nd4/screens/card-in.gen.tsx", import.meta.url), "utf8");
  assert.match(gen, /data-testid="more-menu"/, "the «…» is gone from the card's head");
  assert.match(card, /<CardHead [^>]*onMore=\{openMore\}/, "the card does not draw the head with the «…»");
  const rules = [...css.matchAll(/([^{}]*(?:more-menu|k-bar-btn)[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length > 0, "no rule lays out the bar's buttons");
  for (const [, sel, body] of rules) assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden/, `${sel.trim()} hides the «…»`);
});

// desktop-1440/3-nearby/feed.svg: the feed's middle panel between the rail and the talks pane, four card columns, no yard picture,
// and no round «write» (the rail's «Say» writes), so no cut in the list panel for it (TAB10, requests/xor-ad-09.md).
test("the feed at 1440 is the sheet's middle panel: four columns, no yard picture, no round «write» and no cut for it", () => {
  const css = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const at = css.indexOf("@media (min-width: 1440p" + "x)");
  assert.ok(at >= 0, "wide.css: no 1440 block");
  const wide = css.slice(at);
  assert.match(wide, /\[data-screen="feed"\] \[data-testid="cards"\] \{[^}]*--fd-cols: 4/, "wide.css: the feed at 1440 lost its four columns");
  // newdesign3 (plan A item 3) took the yard picture out of the feed at every width, so no CSS has to hide it at 1440
  assert.doesNotMatch(readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8"), /<Scene\b/, "Feed.tsx: the yard picture is back over the feed");
  assert.match(wide, /\[data-screen="feed"\] \.k-body\[data-fab\] \{[^}]*mask: none/, "wide.css: the list panel at 1440 is cut for a round «write» it does not have");
  assert.match(wide, /\[data-screen="feed"\] > \.k-col \{[^}]*padding: 13p[x] 505p[x] 13p[x] var\(--panel-left\)/, "wide.css: the feed at 1440 left its place between the rail and the talks pane");
});

// The quiet and error states are the archive's blocks (screens 41, 42), generated; the old k-empty markup must not come back.
test("the feed's quiet and error states are the archive's blocks", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /<FeedQuiet /, "Feed.tsx: the quiet state is not the generated block of screen 41");
  assert.match(feed, /<FeedOffline /, "Feed.tsx: the error state is not the generated block of screen 42");
  assert.doesNotMatch(feed, /k-empty/, "Feed.tsx: hand markup k-empty is back next to the archive's blocks");
});

// desktop-1440/3-nearby/feed-loading.svg: the loading feed is the cards' masonry in ghost, three tiles a column of
// unequal heights, not one tile a column.
test("the loading feed is the archive's ghost tiles (screen 40), drawn at every width", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /skeleton && <Ghosts \/>/, "Feed.tsx does not draw the ghosts while loading");
  for (const name of ["feed-loading", "feed-loading-tablet", "feed-loading-laptop"]) {
    const gen = readFileSync(new URL(`../nd4/screens/${name}.gen.tsx`, import.meta.url), "utf8");
    assert.match(gen, /data-testid="loading"/, `${name}: no loading handle`);
    assert.ok((gen.match(/className="tile"/g) ?? []).length >= 4, `${name}: fewer than 4 ghost tiles`);
  }
});

// feed-hidden (archive screen 46): the toast comes from the archive by script; it stands outside the scrolling list.
test("the hidden toast is the archive's, fed with the undo time, outside the scroller", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const at = feed.indexOf("<FeedHidden "), close = feed.indexOf("</section>");
  assert.ok(at > close && close > 0, "Feed.tsx: the toast scrolls with the list");
  assert.match(feed.slice(at, feed.indexOf("/>", at)), /onUndo=\{bringBack\}[^]*UNDO_HIDE_MS/, "Feed.tsx: the toast lost its undo or its time");
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  assert.equal(wide.match(/\.k-col > \.ktoast \{ left: calc\(var\(--panel-left\)/g)?.length, 2, "wide.css: at 1440 or 1920 the toast spans the window, not the feed's column");
});

// desktop-1920/3-nearby/feed.svg: at 1920 the talks pane is wider; the feed keeps between the rail and it (TAB18).
test("the feed at 1920 stands between the rail and the wider talks pane", () => {
  const css = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const at = css.search(/@media \(min-width: 1920p[x]\)/);
  assert.ok(at >= 0, "wide.css: no 1920 block");
  const wide = css.slice(at);
  assert.match(wide, /\[data-screen="feed"\] > \.k-col \{[^}]*padding: 16p[x] 712p[x] 16p[x] var\(--panel-left\)/, "wide.css: the feed at 1920 runs under the talks pane: its 1920 place is missing");
  assert.match(wide, /\[data-screen="feed"\] \.nd-icon\.k-empty-mark \{[^}]*width: 110p[x]/, "wide.css: the empty and error mark stays 82 at 1920, the sheet draws it 110");
});

// desktop-1920/3-nearby/feed-loading.svg: the root's three columns at 1920 must not split the ghosts (TAB18).
test("the loading ghosts keep two columns across the list at the wide widths", () => {
  const css = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  assert.match(css, /\[data-screen="feed"\] \[data-testid="loading"\] \{[^}]*--fd-cols: 2/, "wide.css: the ghosts follow the root's 3 columns at 1920: pin them to 2");
});

// The head's search and «more» (owner, questionnaire 28.10): search filters the loaded phrases; «more» is a sheet of
// likes I gave, a new table and the place.
test("the feed head searches the loaded phrases and says when none holds the words", () => {
  const src = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="search-open"[^\n]*name="search"|name="search"[^\n]*data-testid="search-open"/, "Feed.tsx: no round search button in the head");
  assert.match(src, /feedRows\(items, gone, query \?\? ""\)/, "Feed.tsx: the rows ignore the typed query");
  assert.match(src, /type="search"[^\n]*data-testid="search"/, "Feed.tsx: no search field");
  assert.match(src, /data-testid="search-close"/, "Feed.tsx: the search cannot be closed");
  assert.match(src, /data-testid="search-none"[^\n]*app\.feed\.search_none/, "Feed.tsx: an empty search shows the quiet feed instead of «none has it»");
  const kit = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(kit, /\.k-search > \.k-field::-webkit-search-cancel-button \{ display: none/, "kit.css: the search field shows two crosses, the browser's and ours");
});

test("the feed head's «more» opens a sheet: likes I gave, a new table, the place", () => {
  const src = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="feed-more"[^\n]*name="more"|name="more"[^\n]*data-testid="feed-more"/, "Feed.tsx: no round «more» in the head");
  const sheet = src.slice(src.indexOf("function FeedMenu"));
  assert.ok(src.includes("function FeedMenu"), "Feed.tsx: no FeedMenu sheet");
  assert.match(sheet, /data-testid=\{m\.id\}/, "FeedMenu: its items carry no testid");
  for (const id of ["menu-likes", "menu-table", "menu-place"]) assert.ok(sheet.includes(`id: "${id}"`), `FeedMenu: no ${id}`);
});

// desktop-1440/3-nearby/my-marks.svg: the likes tab is the feed's frame, the talks' pane at its right (TAB20).
test("the likes screen stands in the feed's frame beside the talks' pane", () => {
  const app = readFileSync(new URL("../shell/App.tsx", import.meta.url), "utf8");
  assert.match(app, /PANE_BESIDE = new Set<Screen\["at"\]>\(\[[^\]]*"likes"/, "App.tsx: the likes screen has no talks' pane at 1440");
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  assert.match(wide, /\[data-screen="likes"\] > \.k-col \{[^}]*padding: 13p[x] 505p[x]/, "wide.css: the likes screen runs under the rail and the pane at 1440");
  assert.match(wide, /\[data-screen="likes"\] \.k-grid2 \{[^}]*--fd-cols: 2/, "wide.css: the likes split into the root's 3 columns at 1920");
});

// my-marks.svg at 1440/1920 draws the feed's head over the likes: at the desktop the switch turns the feed's body to
// the likes in place (coordinator's call by the sheet, 28.10); the phone keeps the likes screen with its title.
test("at the desktop the likes tab turns the feed's body to the likes under the feed's head", () => {
  const src = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const likes = readFileSync(new URL("./talks/Likes.tsx", import.meta.url), "utf8");
  assert.match(likes, /export function LikesBody\(/, "Likes.tsx: the likes list is not its own part, the feed cannot show it");
  assert.match(src, /useMinWidth\("--bp-desktop"\)/, "Feed.tsx: the feed does not know the desktop");
  assert.match(src, /onLiked=\{\(\) => \(desk \? setLikesTab\(!likesOn\) : onLikes\?\.\(\)\)\}/, "Feed.tsx: the likes tab does not turn the body at the desktop and open the screen on the phone");
  assert.match(src, /const likesTab = desk && likesOn/, "Feed.tsx: a window shrunk under the desktop keeps the likes under the feed's head");
  assert.match(src, /onCompose && !likesTab &&/, "Feed.tsx: the «say» button stands over the likes");
  assert.match(src, /likedOn=\{likesTab\}/, "Feed.tsx: the switch does not show the likes tab pressed");
  assert.match(src, /likesTab \? <LikesBody client=\{client\} onGo=\{\(\) => setLikesTab\(false\)\}/, "Feed.tsx: the feed's body never turns to the likes, or the empty likes do not lead back to the feed");
  // archive 49, 50: the generated tile and empty middle are the ones drawn, the old tile's classes are gone
  assert.match(likes, /<MyMarksEmpty [^\n]*onGo=\{onGo\}/, "Likes.tsx: the empty likes are not the archive's screen 50");
  assert.match(likes, /<MyMarksTile /, "Likes.tsx: the likes' tile is not the archive's screen 49");
  assert.doesNotMatch(likes, /className="k-tile"|k-seg|k-panel/, "Likes.tsx: the old look is still drawn");
  // the toast of 46 stands over the round «write» at the phone's and the tablet's width: the button rises
  const kit = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(kit, /\[data-screen="feed"\]:has\(\.ktoast\) \.k-fab \{ bottom: 176p[x]/, "kit.css: the hidden toast covers the round «write»");
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  assert.match(wide, /\[data-screen="feed"\] \[data-testid="liked"\] \{[^}]*--fd-cols: 2/, "wide.css: the likes in the feed split into the root's 3 columns at 1920");
});

// newdesign4 36 feed-own, 37 my-phrase, 41 feed-empty: the generated screens are the ones drawn, the strip is gone
test("own phrase: the generated tile and screen are wired; the quiet screen hides «write»", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const my = readFileSync(new URL("./MyPhrase.tsx", import.meta.url), "utf8");
  assert.match(feed, /<OwnTile /, "Feed.tsx: the checking tile (36) is not drawn");
  assert.match(feed, /<MyPhrase /, "Feed.tsx: one's own phrase (37) does not open");
  assert.doesNotMatch(feed, /className="k-note" data-testid="sent"/, "Feed.tsx: the old sent strip is back");
  assert.match(feed, /!likesTab && !quiet && \(/, "Feed.tsx: «write» stands on the quiet screen (spec 26)");
  for (const w of ["my-phrase.gen", "my-phrase-tablet.gen", "my-phrase-laptop.gen"]) assert.ok(my.includes(w), `MyPhrase.tsx: ${w} not used`);
});
test("ownLeft and ownFade: minutes rounded up, nothing while checked or past the end, the fill capped", () => {
  assert.deepEqual(ownLeft(3600 + 8400, 3600_000), { h: 2, m: 20, left: 140 });
  assert.deepEqual(ownLeft(61, 0), { h: 0, m: 2, left: 2 });
  assert.equal(ownLeft(undefined, 0), null);
  assert.equal(ownLeft(10, 10_000), null);
  assert.equal(ownFade(130), "50%");
  assert.equal(ownFade(999), "100%");
});

// desktop 3-nearby card.svg (TAB21): at 1440+ the card opens in the right pane and the feed stays beside it
test("feed at 1440: the card opens in the pane, not over the feed", () => {
  const src = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(src, /const desk = useMinWidth\("--bp-desktop"\);/, "CardScreen has no desktop branch");
  assert.match(src, /className=\{desk \? "k-screen k-card-pane" : "k-screen k-over"\} data-screen="card"/, "the card is not the pane at desk");
});

// desktop 3-nearby offer-card.svg, offer-exit.svg (TAB21): an offer's card carries its venue and a round link button that opens the exit (Offer.tsx) in the card
test("feed: a venue's card shows its promo code, and its menu opens the report page with the offer", () => {
  const src = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(src, /venueOffer && offer\.promo_code \? say\("app\.card\.promo"/, "the promo code a venue gave is not on the card");
  assert.match(src, /window\.open\(reportUrl/, "a venue's menu does not open the report page");
  assert.equal(offerReportUrl("a b", "sosed.place/o/x"), "https://sosed.place/report.html?kind=offer&id=a%20b");
  assert.equal(offerReportUrl("a", "http://127.0.0.1:1/o/x"), "http://127.0.0.1:1/report.html?kind=offer&id=a");
  assert.equal(offerReportUrl("a"), null, "with no storefront the row stays as it was");
});

test("feed: an offer's card has the venue chip and the link to its exit", () => {
  const src = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  const gen = readFileSync(new URL("../nd4/screens/offer-card.gen.tsx", import.meta.url), "utf8");
  assert.match(gen, /data-testid="offer-venue"/, "no venue on an offer's card");
  assert.match(src, /<OfferPanel venue=\{venueOffer \? offer\.venue_name/, "the card does not give the panel its venue");
  assert.match(readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8"), /<CardScreen\s+key=\{card\.id\}/, "at 1440 the next tile keeps the last card's outcome");
  assert.match(src, /onClick=\{isVenue \? onOpen : onLike\}/, "a venue offer's tile likes an id that is no feed message");
  assert.match(src, /const venueOffer = card\.kind === "offer" && !!offer;/, "a neighbour's phrase with a discount is taken for a venue's offer");
  assert.match(src, /\{venueOffer \? onSay && <OfferHand /, "a neighbour's discount phrase lost «I'm in», and with it the match");
  assert.match(src, /card\.offer\?\.redirect && !card\.offer\.redirect_disabled/, "the link button does not hang on the offer's redirect");
  assert.match(gen, /data-testid="offer-link"/, "no link button on an offer's card");
  assert.match(src, /<OfferFoot [^>]*onLink=\{link \? \(\) => setExit\(link\) : undefined\}/, "the link button does not open the exit");
  assert.match(src, /onLike=\{onSay\} \/>/, "screen 62's hand does not open composing");
  assert.match(src, /<Offer code=\{exit\} client=\{client\} onBack=\{\(\) => setExit\(null\)\} \/>/, "the link does not open the exit in the card");
  assert.match(src, /desk \? <div className="k-me-pane" data-testid="offer-pane"><InPane\.Provider value=\{true\}>\{page\}/, "at the desktop the exit is not in the pane");
});

// desktop 3-nearby composer.svg, composer-refused.svg (TAB21): at the desktop the composer stands in the right pane beside the feed, as the card does
test("feed at 1440: the composer opens in the pane, not over the feed", () => {
  const src = readFileSync(new URL("./Composer.tsx", import.meta.url), "utf8");
  assert.match(src, /const desk = useMinWidth\("--bp-desktop"\)/, "the composer does not read the desktop width");
  assert.match(src, /<main className=\{desk \? "k-screen k-card-pane" : "k-screen k-over"\} data-screen="composer">/, "the composer covers the feed at the desktop");
});

test("feed at 1440: the feed stays beside the composer's pane", () => {
  const app = readFileSync(new URL("../shell/App.tsx", import.meta.url), "utf8");
  assert.match(app, /case "composer": return seated \? <>\{wide && feedOf\(seated\)\}<Composer /, "at the desktop the composer drops the feed");
});

// Crowd run flow-1028-223505: at 1920 a phrase open in the right pane left the whole feed inert, rail included, so «Me» could not
// be pressed. The phrase shuts the feed only where it covers it (the phone); feed-card.tsx puts it in the pane from the same desk width.
test("feed at 1440: a phrase in the right pane leaves the feed and its rail live", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /data-screen="feed" inert=\{card && !desk \? true : undefined\}/, "Feed.tsx: the feed goes inert under a phrase in the desk pane");
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /const desk = useMinWidth\("--bp-desktop"\)/, "feed-card.tsx: the pane no longer opens at the desk width the feed tests");
});

// newdesign4 screen 283: the head row is the archive's (generated, one file for the three widths); the app gives it data.
test("the feed's head is the archive's row of screen 283, with the app's search and menu in its slot", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const gen = readFileSync(new URL("../nd4/screens/feed-head.gen.tsx", import.meta.url), "utf8");
  assert.match(gen, /^\/\/ generated from .*screen 283/, "feed-head.gen.tsx is not generated from screen 283");
  const head = /<header data-testid="feed-head">([\s\S]*?)<\/header>/.exec(feed)?.[1] ?? "";
  assert.match(head, /<FeedHead name=\{placeName\} sub=\{`· \$\{radiusText\(radius\)\}`\}[^\n]*onPlace=\{radiusSheet\}/, "the head does not show «place · km» or does not open the radius sheet");
  for (const id of ["search-open", "feed-more"]) assert.match(head, new RegExp(`data-testid="${id}"`), `${id} is lost from the head`);
  assert.doesNotMatch(feed, /k-uhead-lead|k-seg|k-radii/, "the old head's parts are back");
});

// The laptop's nav is the archive's 232 px: a fixed left padding from the old 112 px rail hid the first column under it (shot 01.11).
test("the feed's column starts past the rail at every wide width", () => {
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const rules = wide.match(/\[data-screen="feed"\] > \.k-col \{ padding: [^;]*;/g) ?? [];
  assert.ok(rules.length >= 2, `wide.css: expected the feed's column rules, found ${rules.length}`);
  for (const r of rules) assert.match(r, /var\(--panel-left\);$/, `wide.css: the feed's left edge is not --panel-left: ${r}`);
});

// card-in «Take back» (owner 28.10): the like goes back through DELETE /feed/:id/like, the card loses it at once.
test("withoutLike: a liked card gives its like back once, never below none; an unliked one stays", () => {
  const back = withoutLike(c("1", { like_count: 4, liked: true }));
  assert.deepEqual([back.liked, back.like_count], [false, 3], "the taken-back like did not leave the card");
  assert.equal(withoutLike(c("2", { like_count: 0, liked: true })).like_count, 0, "the count went below none");
  const plain = c("3", { like_count: 2 });
  assert.equal(withoutLike(plain), plain, "a card not liked changed");
});

test("the card's «you're here» has the round «Take back» calling unlike, wired from the feed", () => {
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /<CardHandLit label=\{say\("app\.card\.take_back"\)\} off=\{busy \|\| !onUnlike\} onUnlike=\{\(\) => void unlike\(\)\} \/>/, "feed-card.tsx: no «Take back» by «you're here»");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /client\.unlike\(card\.id\)[\s\S]*?state === "unliked"[\s\S]*?withoutLike\(c\)/, "Feed.tsx does not take the like back through client.unlike");
  assert.match(feed, /onUnlike=\{unlike\}/, "Feed.tsx does not give the card its «Take back»");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  assert.equal(i18n.split('"app.card.take_back":').length - 1, 2, "app.card.take_back is not in both RU and EN");
});

test("a phrase's card draws the archive's 51 and 52: the hand takes the like back, the talk opens from the both-liked foot", () => {
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /<CardHandLit label=\{say\("app\.card\.take_back"\)\} off=\{busy \|\| !onUnlike\} onUnlike=\{\(\) => void unlike\(\)\} \/>/, "the lit hand does not take the like back");
  assert.match(card, /<CardHand label=\{say\("app\.feed\.im_in"\)\}.*: \(\) => void like\(\)\} \/>/, "the hand does not like");
  assert.match(card, /<CardBothTalk talkText=\{label\("web\.match\.talk"\)\} onTalk=\{onTalk\} \/>/, "the both-liked foot does not open the talk");
  assert.match(card, /<RailTablet active="feed" \/>\{body\}/, "the tablet's card lost the rail");
  assert.match(card, /onLike=\{need && onSay \? \(\) => open\("card-need", <NeedSheet onSay=\{onSay\} \/>\)/, "card-need: the hand does not open the sheet");
  assert.match(card, /sayText=\{say\("app\.card\.need_say"\)\}\s*onSay=\{\(\) => \{ close\(\); onSay\(\); \}\}/, "card-need does not offer to write");
  assert.doesNotMatch(card, /!card\.offer \? phrase/, "an offer's card went back to the kit's drawing");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  assert.equal(i18n.split('"app.card.both":').length - 1, 2, "app.card.both is not in both RU and EN");
});

// card-need (owner 28.10): the node refuses a like without a live phrase of one's own (relay routes/likes.ts, 409);
// the card knows it ahead from the profile's phrases and offers «Write a phrase» in place of «I'm in».
test("ownLive: a phrase with its end ahead counts, an ended one or one waiting for the queue does not", () => {
  const now = 1_000_000_000_000;
  assert.equal(ownLive(undefined, now), false, "no phrases counted as live");
  assert.equal(ownLive([{}], now), false, "a phrase waiting for the queue counted as live");
  assert.equal(ownLive([{ expires_at: now / 1000 - 1 }], now), false, "an ended phrase counted as live");
  assert.equal(ownLive([{}, { expires_at: now / 1000 + 60 }], now), true, "a live phrase was not seen");
});

test("card-need: the hand opens the sheet that says «say yours first» and offers «Write a phrase»", () => {
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /const need = needPhrase && !lit && !matched && card\.kind !== "offer";/, "feed-card.tsx: card-need is not drawn from needPhrase");
  assert.match(card, /title=\{say\("app\.card\.need_title"\)\} text=\{say\("app\.card\.need"\)\}/, "feed-card.tsx: no «say yours first» sheet");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /setNeedPhrase\(!ownLive\(p\?\.phrases, Date\.now\(\)\)\)/, "Feed.tsx does not ask the profile for a live phrase");
  assert.match(feed, /needPhrase=\{needPhrase\}\s*onSay=/, "Feed.tsx does not give the card card-need");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const key of ["app.card.need", "app.card.need_say", "app.card.need_title", "app.card.need_later", "app.card.more_hide", "app.card.more_hide_sub", "app.card.more_notice_sub", "app.card.more_block_sub"]) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});

test("widenedTo: the node's grown circle is said, the asked one is not (relay routes/feed.ts:620)", () => {
  assert.equal(widenedTo(1000, { radius_used: 25000 }), 25000, "a page from 25 km passed for the asked 1 km");
  assert.equal(widenedTo(1000, {}), null, "a page in the asked circle was said to be wider");
  assert.equal(widenedTo(1000, { radius_used: 1000 }), null, "the asked circle was said to be wider");
  assert.equal(widenedTo(1000, { radius_used: "25000" }), null, "a radius_used that is not a number was trusted");
});

test("widened feed: the screen says the wider circle on the first page, the card marks a far phrase", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /if \(!after\) \{ const w = widenedTo\(radius, page.*?setWidened\(w\); noteWidened\(radius, w\);/, "Feed.tsx does not read radius_used from the first page, or does not hand it to the place map (screen 29)");
  assert.match(feed, /data-testid="feed-widened"[^>]*>\{say\("app\.feed\.widened"/, "Feed.tsx does not say the wider circle");
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /card\.farther_than_asked \? ` · \$\{say\("app\.feed\.farther"\)\}`/, "feed-card.tsx does not mark a far phrase");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const key of ["app.feed.widened", "app.feed.farther"]) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});

// The panel's round cut for the write button showed on the 390 shot; the archive has no such cut.
test("the feed's panel is not cut under the write button", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(feed, /data-fab/, "Feed.tsx: the panel is cut for the round button again; the archive draws no cut");
});

// Screen 283: tiles sit on the page, no panel; search and menu match the row's 44 px round button at every width.
test("the feed has no panel round its tiles and 44 px search and menu", () => {
  const kit = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(kit, /main\[data-screen="feed"\] \.k-body \{[^}]*background: none/, "kit.css: the feed's panel is back round the tiles");
  assert.match(kit, /main\[data-screen="feed"\] \.k-uhead-btn \{[^}]*width: 44p[x]/, "kit.css: the feed's search and menu left the row's 44 px");
});

test("ownFaded: only past a known end; a phrase still checked has none", () => {
  assert.equal(ownFaded(undefined, 5000), false);
  assert.equal(ownFaded(6, 5000), false);
  assert.equal(ownFaded(5, 5000), true);
});
