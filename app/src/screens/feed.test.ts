// The feed's pure part (screens/feed-logic.ts) and the place it looks at (place.ts).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { placeOf } from "../place.ts";
import { cardEntry, cardOf, feedRows, matchesQuery, peerName, sentOf, stepKey, stepOf, STEPS, takedownVerdict, withoutCard, type FeedCard, type Gone, likeOutcome, mergePage, offerLabel, RADII, radiusWord, toneOf, UNDO_HIDE_MS, visibleCards, widenedTo, widerRadius, withLike, withoutLike, ownLive } from "./feed-logic.ts";

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
  // the «…» is the prototype's bar button (feed-card.tsx: k-bar-btn, data-testid more-menu)
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /className="k-bar-btn"[^>]*data-testid="more-menu"/, "the «…» is no longer the bar's button: look again where it is laid out");
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
  assert.match(wide, /\[data-screen="feed"\] > \.k-col \{[^}]*padding: 13p[x] 505p[x] 13p[x] 137p[x]/, "wide.css: the feed at 1440 left its place between the rail and the talks pane");
});

// The quiet and error marks are an 82 px circle round the icon (kit.css). nd-icons.css loads after kit.css and gives every
// .nd-icon 1em, so a lone .k-empty-mark lost: the circle shrank to its padding, the icon to nothing (TAB10 shot feed-empty).
test("the feed's quiet and error mark keeps its 82 px circle over the icons' own 1em", () => {
  const kit = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /<NdIcon name="empty" className="k-empty-mark"/, "Feed.tsx: the quiet state no longer draws its mark as an NdIcon: look again at what sizes it");
  assert.match(kit, /\.nd-icon\.k-empty-mark \{[^}]*width: 82p[x]/, "kit.css: .k-empty-mark loses to .nd-icon { width: 1em } from nd-icons.css: write it as .nd-icon.k-empty-mark");
});

// desktop-1440/3-nearby/feed-loading.svg: the loading feed is the cards' masonry in ghost, three tiles a column of
// unequal heights, not one tile a column.
test("the loading feed is six ghost tiles of unequal heights, three to a column", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const loading = feed.match(/data-testid="loading"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.ok(loading, "Feed.tsx: no loading block");
  const ghosts = feed.match(/GHOSTS = \[([^\]]*)\]/)?.[1].split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  assert.equal(ghosts.length, 3, "Feed.tsx: the loading column is not three ghost heights (GHOSTS)");
  assert.ok(new Set(ghosts).size > 1, "Feed.tsx: the ghost tiles are all one height, the sheet's are not");
  assert.match(loading, /GHOSTS/, "Feed.tsx: the loading block does not draw the GHOSTS");
});

// feed-hidden (proto at 390 and desktop-1440/3-nearby/feed-hidden.svg): «hidden» is a bar at the list panel's foot, not
// a note over the cards: the crossed eye, the words, «return» as a round arrow and a ring that runs out with the undo time.
test("the hidden row is the foot bar: eye, words, a round «return» and the undo ring", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const bar = feed.match(/<div className="k-undo"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.ok(bar, "Feed.tsx: the hidden row is not the k-undo foot bar");
  assert.match(bar, /data-why="hidden"/, "Feed.tsx: the foot bar lost its gone/hidden mark");
  assert.match(bar, /data-testid="hidden-undo"[^>]*>\s*<NdIcon name="refresh"/, "Feed.tsx: «return» is not the round arrow");
  assert.match(bar, /aria-label=\{say\("web\.feed\.hidden_undo"\)\}/, "Feed.tsx: the round «return» has no name to read aloud");
  assert.match(bar, /className="k-undo-ring"[^>]*UNDO_HIDE_MS/, "Feed.tsx: the undo ring does not run on UNDO_HIDE_MS");
  const cards = feed.indexOf('data-testid="cards"'), at = feed.indexOf('className="k-undo"');
  assert.ok(cards > 0 && at > cards, "Feed.tsx: the foot bar stands above the cards, the sheet puts it under them");
});

// desktop-1440/3-nearby/feed.svg: the head carries the five radii as round chips (r100 … r10k, the current one pressed)
// in place of the phone's one chip that opens the radius sheet; which one shows is the width's (CSS).
test("the feed head has a round chip for every radius, the current one pressed", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const group = feed.match(/<div className="k-radii"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.ok(group, "Feed.tsx: the head has no k-radii group");
  assert.match(group, /RADII\.map/, "Feed.tsx: the radii chips are not drawn from RADII, a new radius would miss its chip");
  assert.match(group, /aria-pressed=\{r === radius\}/, "Feed.tsx: the current radius chip is not pressed");
  assert.match(group, /RADIUS_ICON\[r\]/, "Feed.tsx: a radius chip lost its radius icon");
  assert.match(group, /aria-label=/, "Feed.tsx: a radius chip has no name to read aloud");
});

// desktop-1920/3-nearby/feed.svg: at 1920 the talks pane is wider; the feed keeps between the rail and it (TAB18).
test("the feed at 1920 stands between the rail and the wider talks pane", () => {
  const css = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const at = css.search(/@media \(min-width: 1920p[x]\)/);
  assert.ok(at >= 0, "wide.css: no 1920 block");
  const wide = css.slice(at);
  assert.match(wide, /\[data-screen="feed"\] > \.k-col \{[^}]*padding: 16p[x] 712p[x] 16p[x] 144p[x]/, "wide.css: the feed at 1920 runs under the talks pane: its 1920 place is missing");
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
  assert.match(src, /desk \? setLikesTab\(true\) : onLikes\?\.\(\)[^\n]*data-testid="seg-likes"/, "Feed.tsx: the likes tab does not turn the body at the desktop and open the screen on the phone");
  assert.match(src, /const likesTab = desk && likesOn/, "Feed.tsx: a window shrunk under the desktop keeps the likes under the feed's head");
  assert.match(src, /onCompose && !likesTab &&/, "Feed.tsx: the «say» button stands over the likes");
  assert.match(src, /aria-selected=\{likesTab\}/, "Feed.tsx: the switch does not show the likes tab pressed");
  assert.match(src, /likesTab \? <LikesBody client=\{client\} hint/, "Feed.tsx: the feed's body never turns to the likes, or loses the empty hint");
  // my-marks-empty.svg at 1440: under «nothing yet» two lines say what the tab holds (the phone has them in its head)
  assert.match(likes, /data-testid="quiet"[^\n]*\{hint && <p>\{say\("app\.likes\.sub"\)\}<\/p>\}/, "Likes.tsx: the empty likes in the feed say nothing of what the tab holds");
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  assert.match(wide, /\[data-screen="feed"\] \[data-testid="liked"\] \{[^}]*--fd-cols: 2/, "wide.css: the likes in the feed split into the root's 3 columns at 1920");
});

// radius.svg at 1440/1920: a second press on the pressed round radius opens the radius/place sheet (owner.md, 28.10)
test("at 1440+ a second press on the current radius opens the radius sheet", () => {
  const src = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(src, /const radiusSheet = \(\) => openSheet\("radius"/, "Feed.tsx: the radius sheet has no one opener for the chip and the round buttons");
  assert.match(src, /onClick=\{\(\) => \(r === radius \? radiusSheet\(\) : \(setLikeNote\(null\), setRadius\(r\)\)\)\}[^\n]*data-testid=\{`radius-chip-/, "Feed.tsx: a press on the current round radius does nothing");
});

// feed-own (desktop-1440/3-nearby/feed-own.svg): the sent strip's «take down» cross stands at the strip's right end,
// not right after the words.
test("the sent strip's cross stands at the strip's right end", () => {
  const kit = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /data-testid="sent"[\s\S]*?className="k-icon-btn"[^\n]*data-testid="takedown"/, "Feed.tsx: the sent strip's cross is no longer a k-icon-btn in the strip");
  assert.match(kit, /\.k-note > \.k-icon-btn \{[^}]*margin-left: auto/, "kit.css: the sent strip's cross sits right after the words: push it to the end");
});

// desktop 3-nearby card.svg (TAB21): at 1440+ the card opens in the right pane and the feed stays beside it
test("feed at 1440: the card opens in the pane, not over the feed", () => {
  const src = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(src, /const desk = useMinWidth\("--bp-desktop"\);/, "CardScreen has no desktop branch");
  assert.match(src, /className=\{desk \? "k-screen k-card-pane" : "k-screen k-over"\} data-screen="card"/, "the card is not the pane at desk");
});

// desktop 3-nearby offer-card.svg, offer-exit.svg (TAB21): an offer's card carries its venue and a round link button that opens the exit (Offer.tsx) in the card
test("feed: an offer's card has the venue chip and the link to its exit", () => {
  const src = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="offer-venue"/, "no venue chip on an offer's card");
  assert.match(src, /card\.offer\?\.redirect && !card\.offer\.redirect_disabled/, "the link button does not hang on the offer's redirect");
  assert.match(src, /data-testid="offer-link"/, "no link button on an offer's card");
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

// newdesign3 feed.html (plan A item 3): the feed's head is the kit's .uhead — the «nearby» lead, the title pill with
// «place · km» under it, the round place button that opens the radius sheet; search and menu are round head buttons too.
test("the feed's head is .k-uhead: nearby lead, «place · km» line, round place button", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  const head = /<header className="k-uhead" data-testid="feed-head">([\s\S]*?)<\/header>/.exec(feed)?.[1] ?? "";
  assert.ok(head, "Feed.tsx: no .k-uhead head");
  assert.match(head, /k-uhead-lead[^>]*><NdIcon name="nearby"/, "the head lost its «nearby» lead");
  assert.match(head, /data-testid="feed-where">\{`\$\{placeName\} · \$\{radiusText\(radius\)\}`\}/, "the head's line is not «place · km»");
  assert.match(head, /className="k-uhead-btn"[^>]*data-testid="radius-open" onClick=\{radiusSheet\}><NdIcon name="place"/, "no round place button opening the radius sheet");
  for (const id of ["search-open", "feed-more"]) assert.match(head, new RegExp(`className="k-uhead-btn"[^\\n]*data-testid="${id}"`), `${id} is not a round head button`);
});

// The open search takes the head (TAB10): with .k-uhead the rule that steps the round buttons aside must name .k-uhead,
// not the old .k-row, or at 390 the field is squeezed between six circles.
test("while searching, the feed's head hides the radii, place, search and menu buttons", () => {
  const css = readFileSync(new URL("../../tokens/kit.css", import.meta.url), "utf8");
  const rule = /\.k-uhead:has\(> \.k-search\) > :is\(([^)]*)\) \{ display: none; \}/.exec(css)?.[1] ?? "";
  for (const want of [".k-radii", "radius-open", "search-open", "feed-more"]) assert.ok(rule.includes(want), `kit.css: the open search does not hide ${want}`);
});

// newdesign3 desktop-1920-feed.html (plan A item 4): the five radii show at 1920 only, as the head's 96 pill of 88 squares
// with the current one in the accent; at 1440 they stay hidden (kit.css .k-radii none) and the round place button stays.
test("the feed's desktop head: five radii in a 96 pill at 1920 only, the place button at 1440", () => {
  const wide = readFileSync(new URL("../../tokens/wide.css", import.meta.url), "utf8");
  const blocks = (w: number) => wide.split(new RegExp(`@media \\(min-width: ${w}px\\) \\{`)).slice(1).map((b) => b.split(/\n\}\n/)[0]).join("\n");
  const at1920 = blocks(1920), at1440 = blocks(1440);
  assert.match(at1920, /\.k-uhead > \.k-radii \{ display: flex;[^}]*height: 96[p]x/, "wide.css: no 96 radius pill at 1920");
  assert.match(at1920, /\.k-radii > \.k-round \{ width: 88[p]x; height: 88[p]x/, "wide.css: the radius squares are not 88 at 1920");
  assert.match(at1920, /\.k-round\[aria-pressed="true"\] \{ background: var\(--relief-acc\)/, "wide.css: the current radius is not in the accent");
  assert.match(at1920, /\[data-testid="radius-open"\] \{ display: none/, "wide.css: the place button stays beside the radii at 1920");
  assert.doesNotMatch(at1440, /\.k-radii \{ display: flex|\[data-testid="radius-open"\] \{ display: none/, "wide.css: at 1440 the radii show or the place button hides");
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
  assert.match(card, /className="k-round" aria-label=\{say\("app\.card\.take_back"\)\}[^>]*onClick=\{\(\) => void unlike\(\)\}[^>]*data-testid="unlike"><NdIcon name="close" \/>/, "feed-card.tsx: no round ✕ «Take back» by «you're here»");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /client\.unlike\(card\.id\)[\s\S]*?state === "unliked"[\s\S]*?withoutLike\(c\)/, "Feed.tsx does not take the like back through client.unlike");
  assert.match(feed, /onUnlike=\{unlike\}/, "Feed.tsx does not give the card its «Take back»");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  assert.equal(i18n.split('"app.card.take_back":').length - 1, 2, "app.card.take_back is not in both RU and EN");
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

test("card-need: the card says «say yours first» and offers «Write a phrase» in place of «I'm in»", () => {
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /const need = needPhrase && !lit && !matched && !card\.offer;/, "feed-card.tsx: card-need is not drawn from needPhrase");
  assert.match(card, /data-testid="need-phrase"><NdIcon name="phrase" \/><span>\{say\("app\.card\.need"\)\}/, "feed-card.tsx: no «say yours first» note");
  assert.match(card, /need && onSay\s*\? <button type="button" className="k-cta" onClick=\{onSay\} data-testid="need-say"><NdIcon name="write" \/>/, "feed-card.tsx: «I'm in» is not replaced by «Write a phrase»");
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /setNeedPhrase\(!ownLive\(p\?\.phrases, Date\.now\(\)\)\)/, "Feed.tsx does not ask the profile for a live phrase");
  assert.match(feed, /needPhrase=\{needPhrase\}\s*onSay=/, "Feed.tsx does not give the card card-need");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const key of ["app.card.need", "app.card.need_say"]) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});

test("widenedTo: the node's grown circle is said, the asked one is not (relay routes/feed.ts:620)", () => {
  assert.equal(widenedTo(1000, { radius_used: 25000 }), 25000, "a page from 25 km passed for the asked 1 km");
  assert.equal(widenedTo(1000, {}), null, "a page in the asked circle was said to be wider");
  assert.equal(widenedTo(1000, { radius_used: 1000 }), null, "the asked circle was said to be wider");
  assert.equal(widenedTo(1000, { radius_used: "25000" }), null, "a radius_used that is not a number was trusted");
});

test("widened feed: the screen says the wider circle on the first page, the card marks a far phrase", () => {
  const feed = readFileSync(new URL("./Feed.tsx", import.meta.url), "utf8");
  assert.match(feed, /if \(!after\) setWidened\(widenedTo\(radius, page/, "Feed.tsx does not read radius_used from the first page");
  assert.match(feed, /data-testid="feed-widened"[^>]*>\{say\("app\.feed\.widened"/, "Feed.tsx does not say the wider circle");
  const card = readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8");
  assert.match(card, /card\.farther_than_asked \? ` · \$\{say\("app\.feed\.farther"\)\}`/, "feed-card.tsx does not mark a far phrase");
  const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  for (const key of ["app.feed.widened", "app.feed.farther"]) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} is not in both RU and EN`);
});
