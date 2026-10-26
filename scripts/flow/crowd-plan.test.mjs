// The crowd's plan against the code (docs/reviews/CROWD_INTERACTION_PLAN_RU.md §2, §3.3): the games are read from
// depth/core/new_table.ts GAMES, the rounds and ages from crowd.mjs, so a new game or a reshuffled round fails here.
//   node --test scripts/flow/crowd-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const crowd = readFileSync(new URL("crowd.mjs", here), "utf8");
const games = [...readFileSync(new URL("../../depth/core/new_table.ts", here), "utf8").matchAll(/\{ id: "([a-z]+)", klass:/g)].map((m) => m[1]);
const pick = (name) => Function(`return ${new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);\\n`).exec(crowd)[1]}`)();
const AGES = pick("AGES"), ROUNDS = pick("ROUNDS");
const TOWNS = pick("TOWNS").map((t) => t[1]);
const band = (a) => (a <= 20 ? [Math.max(13, a - 2), a + 2] : [Math.min(21, a - 2), Infinity]);
const inBand = (a, b) => b >= band(a)[0] && b <= band(a)[1];

test("every game of GAMES is played in some round", () => {
  const played = new Set(ROUNDS.flat().map((g) => g[0]));
  const missing = games.filter((g) => !played.has(g));
  assert.equal(games.length, 12, `GAMES has ${games.length}, the plan says 12`);
  assert.deepEqual(missing, [], `not played: ${missing.join(", ")} (${games.length - missing.length} of ${games.length})`);
});

test("no one sits at two tables in one round", () => {
  for (const [k, round] of ROUNDS.entries()) {
    const who = round.flatMap(([, m, guests]) => [m, ...guests]);
    assert.equal(new Set(who).size, who.length, `round ${k + 1} seats someone twice: ${who}`);
  }
});

test("the players of a table may meet: one town, each in the other's band", () => {
  for (const [game, m, guests] of ROUNDS.flat()) for (const g of guests) {
    assert.equal(TOWNS[m], TOWNS[g], `${game}: ${m} and ${g} live in different towns`);
    assert.ok(inBand(AGES[m], AGES[g]) && inBand(AGES[g], AGES[m]), `${game}: ages ${AGES[m]} and ${AGES[g]} cannot meet`);
  }
});

test("the venue path walks all seven steps of plan §3.5.2, а to ж", () => {
  const plan = readFileSync(new URL("../../docs/reviews/CROWD_INTERACTION_PLAN_RU.md", here), "utf8");
  const letters = [...plan.matchAll(/^- ([а-ж])\) /gm)].map((m) => m[1]);
  const walked = new Set([...crowd.matchAll(/vstep\("([а-ж])(?:–([а-ж]))? /g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
  const missing = letters.filter((l) => !walked.has(l));
  assert.equal(letters.length, 7, `the plan lists ${letters.length} venue steps`);
  assert.deepEqual(missing, [], `not walked: ${missing.join(", ")} (${letters.length - missing.length} of ${letters.length})`);
});

test("six people under 21, nobody under the floor of 13", () => {
  assert.equal(AGES.filter((a) => a < 21).length, 6);
  assert.ok(AGES.every((a) => a >= 13));
});

// Run flow-1025-182252: Giorgos (17) and Hana (45), alone in Nicosia, could never meet, so neither had a chat.
test("everyone has someone in town to meet", () => {
  const alone = AGES.map((_, i) => i).filter((i) => !AGES.some((_, j) => j !== i && TOWNS[i] === TOWNS[j] && inBand(AGES[i], AGES[j]) && inBand(AGES[j], AGES[i])));
  assert.deepEqual(alone, [], `nobody to meet: ${alone.join(", ")} (${AGES.length - alone.length} of ${AGES.length} have someone)`);
});

// Chat spec §6.2 (owner 25.10: «пусть видят … вместе будут играть»): every game the app plays alone (SOLO_GAMES in
// app/src/screens/tables/solo-logic.ts) is in the crowd's SOLO set and is played at a table with a guest to see the mark.
test("every solo game of the app is walked: mark, the guest sees it, the application folds the puzzle", () => {
  const app = readFileSync(new URL("../../app/src/screens/tables/solo-logic.ts", here), "utf8");
  const solo = Object.keys(Function(`return ${/export const SOLO_GAMES[^=]*= (\{[^}]*\});/.exec(app)[1]}`)());
  const walked = new Set(/const SOLO = new Set\((\[[^\]]*\])\)/.exec(crowd) ? Function(`return ${/const SOLO = new Set\((\[[^\]]*\])\)/.exec(crowd)[1]}`)() : []);
  assert.ok(solo.length >= 2, `SOLO_GAMES has ${solo.length}`);
  for (const g of solo) {
    assert.ok(walked.has(g), `${g} plays alone in the app and the crowd does not walk it`);
    assert.ok(ROUNDS.flat().some(([game, , guests]) => game === g && guests.length > 0), `${g} has no table with a guest`);
  }
  for (const step of ["soloOpen", "soloSeen", "soloGuest"]) assert.match(crowd, new RegExp(`async function ${step}\\(`), `${step} is gone`);
});

test("a guest presses the watcher's application, else no game ever starts (run flow-1025-210340: 0 of 12)", () => {
  assert.match(crowd, /data-testid="apply"\]:visible/, "ready() does not press «apply»");
  const table = readFileSync(new URL("../../app/src/screens/tables/Table.tsx", here), "utf8");
  assert.match(table, /data-testid="apply"/, "the table screen has no «apply» for a watcher");
});

// Run flow-1025-222238: «stand up» was looked for before the sheet rose, 24 of 25 seats stayed, and the next rounds' sits
// got 409 already_seated (the node seats one table at a time) yet passed. Every round ends standing, and a refusal fails.
test("a round ends with everyone standing up, and a refused seat fails the step", () => {
  const stand = /async function standUp[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  assert.match(stand, /table-stand"\]'\);\s*await st\.waitFor\(/, "standUp() does not wait for «stand up» in the sheet");
  assert.doesNotMatch(stand, /return "no «stand up»"/, "standUp() passes without standing up");
  const sit = /async function sitAt[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  assert.match(sit, /r\.status\(\) >= 300\) throw/, "sitAt() passes a refused seat");
  assert.match(crowd, /game-\$\{g\.game\}-stand`, \(\) => standUp/, "a round does not stand its players up");
});

// Run flow-1026-070519: 7 of 7 «not in the list» came straight from a stand-up — the list loaded once, on mount. Now the
// open list looks again (Tables.tsx useEvery), so the guest waits on the screen and does not step away.
test("a guest waits on the open list for the new table, longer than the list's look, and never steps away", () => {
  const sit = /async function sitAt[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  assert.doesNotMatch(sit, /tab\(p, "feed", "feed"\)/, "sitAt() still steps away and back: the app's look is not tested");
  const wait = Number(/row\.waitFor\(\{ timeout: (\d+) \}\)/.exec(sit)?.[1]);
  const look = Number(/TABLES_LOOK_MS = ([\d_]+)/.exec(readFileSync(new URL("../../app/src/screens/tables/tables-logic.ts", here), "utf8"))?.[1].replace(/_/g, ""));
  assert.ok(wait > look, `sitAt() waits ${wait} ms, the list looks every ${look} ms`);
});

// The same run: clicks on a visible tab hung 10 s and the journal had only the error's first line.
test("a failed step keeps Playwright's whole message in the journal", () => {
  const step = /async function step[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  assert.match(step, /error = String\(e\?\.message \?\? e\)\.slice\(0, 4000\)/, "step() keeps only the first line of the error");
  assert.match(step, /shot, error \}\)/, "step() does not write the error to the journal");
});

// Run flow-1026-081126: all players moved in 9 of 12 games. Poker's raise form is a .tg-set, so the hangman's word went
// into it and word-go was waited for 30 s; battleship never placed a fleet (12 of 12 «no move»); durak stopped at the
// first 409 (a card that does not beat).
test("a move try fits the board: the word only by word-go, a fleet first, another card after a refusal", () => {
  const move = /async function tryMove[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  assert.match(move, /form\.tg-set:has\(\[data-testid="word-go"\]\) input/, "tryMove() fills any .tg-set input with the word");
  assert.match(move, /sea-fleet-input[\s\S]*?getAttribute\("placeholder"\)[\s\S]*?sea-fleet-go/, "tryMove() does not place the battleship fleet");
  assert.match(move, /answer !== 200; k\+\+/, "tryMove() stops at the first refused move");
  assert.match(move, /tg-pc\[data-stand="mine"\][\s\S]*?tg-pc\[data-reach\][\s\S]*?cell\.click[^;]*;\s*await cell\.click/, "tryMove() does not tap chapayev's piece, its aim and the aim again");
  const phys = readFileSync(new URL("../../app/src/screens/tables/boards-physics.tsx", here), "utf8");
  assert.match(phys, /if \(aim !== id\) return setAim\(id\);\s*onMove\(\{ flick \}\)/, "chapayev no longer flicks on the second tap at the aim: look again how the crowd moves");
  assert.match(move, /\.tg-actions button:enabled/, "tryMove() presses only the board, not the buttons under it (poker's bets, durak's take)");
  const table = readFileSync(new URL("../../app/src/screens/tables/Table.tsx", here), "utf8");
  assert.match(table, /<\/div>\}\s*<BoardUnder/, "Table.tsx moved BoardUnder: look again where the crowd finds the bets");
  assert.match(move, /why = j\?\.error\?\.code/, "a refused move is journalled without the node's reason");
  assert.match(move, /moves \$\{answer\} \$\{why\}/, "the reason is read but not written to the journal");
  const sea = readFileSync(new URL("../../app/src/screens/tables/boards-sea.tsx", here), "utf8");
  assert.match(sea, /placeholder=\{FLEET_EXAMPLE\}[\s\S]*data-testid="sea-fleet-input"/, "boards-sea.tsx no longer shows a valid fleet as the placeholder");
});

// Review 26.10 (security lens): /tables, /feed and /likes share one read bucket on the node; a look every 15 s took 240 of 300.
test("the open tables list looks again at most a quarter of the node's shared read bucket an hour", () => {
  const limits = readFileSync(new URL("../../relay/node/src/lib/rate_limit.ts", here), "utf8");
  const max = Number(/name: "feed-read", max: (\d+), windowMs: HOUR/.exec(limits)?.[1]);
  assert.ok(max > 0, "rate_limit.ts no longer has the feed-read bucket: look again what the list's look costs");
  const shared = ["tables.ts", "feed.ts", "likes.ts"].filter((f) => /checkAll\(FEED_READ_LIMITS/.test(readFileSync(new URL(`../../relay/node/src/routes/${f}`, here), "utf8")));
  assert.equal(shared.length, 3, `the bucket is shared by ${shared.join(", ")}: look again`);
  const look = Number(/TABLES_LOOK_MS = ([\d_]+)/.exec(readFileSync(new URL("../../app/src/screens/tables/tables-logic.ts", here), "utf8"))?.[1].replace(/_/g, ""));
  assert.ok(3_600_000 / look <= max / 4, `the list looks ${3_600_000 / look} times an hour of ${max}: the feed and likes get 429`);
});

// Run flow-1026-081126: on a phone the phrase covers the tab bar by design; 5 of 5 presses on «me» hit the like button.
test("a person leaves the phrase by its Back before pressing a tab", () => {
  const tab = /async function tab\([\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  const back = tab.indexOf('[data-screen="card"] [data-testid="back"]'), press = tab.indexOf("pg.locator(sel).first().click");
  assert.ok(back > 0 && back < press, "tab() presses a tab under the full-screen phrase");
  const card = readFileSync(new URL("../../app/src/screens/feed-card.tsx", here), "utf8");
  assert.match(card, /data-screen="card"[\s\S]*?data-testid="back"/, "the phrase screen lost its Back: look again how a person leaves it");
});

// Run flow-1026-110213: 5 of 5 phrase menus (notice, hide, block) waited for a testid the app does not have, and a guest
// already on the tables list waited 15 s for a GET the list makes once a minute.
test("the phrase menu is pressed by the app's testid, and the solo check waits longer than the list's look", () => {
  const card = readFileSync(new URL("../../app/src/screens/feed-card.tsx", here), "utf8");
  const menu = /async function cardMenu[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  const id = /\[data-testid="([a-z-]+)"\]'\)\.first\(\)\.click/.exec(menu)?.[1];
  assert.ok(id && new RegExp(`data-testid="${id}"\\s*\\n?\\s*onClick=\\{\\(\\) => open\\("card-more"`).test(card), `cardMenu() presses «${id}», not the button that opens the card's menu in feed-card.tsx`);
  const seen = /async function soloSeen[\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  const wait = Number(/pathname === "\/tables", \{ timeout: (\d+) \}/.exec(seen)?.[1]);
  const look = Number(/TABLES_LOOK_MS = ([\d_]+)/.exec(readFileSync(new URL("../../app/src/screens/tables/tables-logic.ts", here), "utf8"))?.[1].replace(/_/g, ""));
  assert.ok(wait > look, `soloSeen() waits ${wait} ms for GET /tables, the list looks every ${look} ms`);
});

// Run flow-1026-125809: the notice's «accepted» sheet stayed open and Back on the phrase was under it.
test("a person closes a sheet left open by tapping the dim before leaving the phrase", () => {
  const tab = /async function tab\([\s\S]*?\n}\n/.exec(crowd)?.[0] ?? "";
  const dim = tab.indexOf(`.dim[data-on="true"]`), back = tab.indexOf('[data-screen="card"] [data-testid="back"]');
  assert.ok(dim > 0 && dim < back, "tab() presses Back on the phrase under an open sheet");
  const layers = readFileSync(new URL("../../app/src/shell/layers.tsx", here), "utf8");
  assert.match(layers, /className="dim" data-on=\{sheet \? "true" : "false"\} onClick=\{close\}/, "layers.tsx no longer closes a sheet on the dim: look again how the crowd closes it");
});
