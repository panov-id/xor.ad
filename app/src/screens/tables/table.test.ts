// The table frame's rules (table-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { fleetGrid, randomFleet } from "./sea-place.ts";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TableView } from "../../../../depth/core/tables.ts";
import { STICKER_IDS } from "../../../../depth/core/sticker.ts";
import { canApply, canNudge, conStep, diceOf, movesIn, diceStep, dominoView, dotsLayout, facePair, firstAction, footOf, overBanner, fourColumns, hangmanView, keyRows, pipsOf, reversiCells, squares, tapSquare, meLine, MOVE_SECONDS, moveRing, STICKER_CHIPS, tableTitle } from "./table-logic.ts";

const NOW = 1_800_000_000_000;
const view = (over: Partial<TableView> = {}, board: Partial<NonNullable<TableView["board"]>> | null = {}): TableView => ({
  id: "t", class: "grid", set: "four", seat: 1, is_playing: true, playing: 2, watching: 1, like_count: 0, lines: [],
  seats: [{ seat: 1, name: "Alex", role: "playing" }, { seat: 2, name: "Nino", role: "playing" }, { seat: 3, name: "Dato", role: "watching" }],
  board: board === null ? null : { seq: 4, state: {}, turn: 1, score: {}, expires_at: NOW / 1000 + 100, pending: null, ...board },
  ...over,
});

test("the ring: whole minutes of the move left, rounded up, as a share of five; none without a clock", () => {
  assert.equal(MOVE_SECONDS, 300);
  assert.deepEqual(moveRing(view({}, { expires_at: NOW / 1000 + 100 }), NOW), { minutes: 2, share: 100 / 300 });
  assert.equal(moveRing(view({}, { expires_at: NOW / 1000 + 1 }), NOW)?.minutes, 1, "a second left is a minute");
  assert.equal(moveRing(view({}, { expires_at: NOW / 1000 + 900 }), NOW)?.share, 1, "never more than the five");
  assert.equal(moveRing(view({}, { expires_at: null }), NOW), null);
  assert.equal(moveRing(view({}, null), NOW), null);
  assert.equal(moveRing(view({}, { over: true }), NOW), null);
});
test("the title: the game, then the table's own name", () => {
  assert.equal(tableTitle("Four in a row", "Evening at the yard"), "Four in a row · Evening at the yard");
  assert.equal(tableTitle("Dots"), "Dots");
});
test("the faces: mine left, the one whose turn right; a watcher sees the first player left; watchers never", () => {
  assert.deepEqual([facePair(view()).left?.name, facePair(view()).right?.name], ["Alex", "Nino"]);
  const three = view({ seats: [...view().seats, { seat: 4, name: "Ana", role: "playing" }] }, { turn: 4 });
  assert.equal(facePair(three).right?.name, "Ana", "the one whose turn it is, not the next seat");
  const watching = view({ is_playing: false, seat: 3 });
  assert.deepEqual([facePair(watching).left?.name, facePair(watching).right?.name], ["Alex", "Nino"]);
});
test("my line: your move, their move by name, before a game, over; a watcher is told no «you»", () => {
  assert.deepEqual(meLine(view()), { who: "you", state: "your-move" });
  assert.deepEqual(meLine(view({}, { turn: 2 })), { who: "you", state: "their-move", name: "Nino" });
  assert.equal(meLine(view({}, { turn: null })).state, "not-started");
  assert.equal(meLine(view({}, null)).state, "not-started");
  assert.equal(meLine(view({}, { over: true })).state, "over");
  assert.deepEqual(meLine(view({ is_playing: false, seat: 3 })), { who: "name", name: "Alex", state: "watching" });
});
test("the foot: begin while nothing runs, say during a game, the like for a watcher", () => {
  assert.equal(firstAction(view({}, { turn: null })), "start");
  assert.equal(firstAction(view({}, { turn: null, pending: { kind: "rematch", id: "p" } })), "like", "a proposal pending: not begin again");
  assert.equal(firstAction(view()), "say");
  assert.equal(firstAction(view({ is_playing: false, seat: 3 })), "like");
  assert.equal(firstAction(view({}, { over: true })), "start", "after an end: again");
});

test("four in a row: columns a..g, top row first; a column with its top taken takes no piece; mine is my seat's", () => {
  const cells: Record<string, { seat: number; piece: string }> = { d1: { seat: 1, piece: "O" }, d2: { seat: 2, piece: "O" } };
  for (let r = 1; r <= 6; r++) cells[`g${r}`] = { seat: r % 2 ? 1 : 2, piece: "O" };
  const cols = fourColumns({ cells, rules: "four" }, 1);
  assert.deepEqual(cols.map((c) => c.column).join(""), "abcdefg");
  assert.deepEqual(cols[3].cells, ["free", "free", "free", "free", "theirs", "mine"], "row 6 on top, row 1 at the bottom");
  assert.equal(cols[3].open, true);
  assert.equal(cols[6].open, false, "a full column");
  assert.deepEqual(fourColumns({ cells, rules: "four" }, 2)[3].cells.slice(4), ["mine", "theirs"], "seen from the other seat");
});

test("the sticker chips: hi, coffee, deal first as the sheets; the whole catalogue, each once", () => {
  assert.deepEqual(STICKER_CHIPS.slice(0, 3), ["hi", "coffee", "deal"]);
  assert.deepEqual([...STICKER_CHIPS].sort(), [...STICKER_IDS].sort());
});

test("dots: every edge of an n×n field once, taken as the node says; a closed box is mine by my seat", () => {
  const l = dotsLayout({ n: 4, edges: ["h:4:0", "v:0:4"], boxes: { "1:1": 1, "3:3": 2 } }, 1);
  assert.equal(l.edges.length, 2 * 4 * 5, "40 edges on a 4×4 field");
  assert.equal(new Set(l.edges.map((e) => e.id)).size, 40);
  assert.deepEqual(l.edges.filter((e) => e.taken).map((e) => e.id).sort(), ["h:4:0", "v:0:4"]);
  assert.deepEqual(l.edges.find((e) => e.id === "v:0:4"), { id: "v:0:4", dir: "v", r: 0, c: 4, taken: true });
  assert.deepEqual(l.boxes, [{ r: 1, c: 1, stand: "mine" }, { r: 3, c: 3, stand: "theirs" }]);
});

test("hangman keys: English as QWERTY (three rows), another alphabet ten to a row in its order, none given is English", () => {
  assert.deepEqual(keyRows([..."abcdefghijklmnopqrstuvwxyz"]).map((r) => r.join("")), ["qwertyuiop", "asdfghjkl", "zxcvbnm"]);
  assert.deepEqual(keyRows(null).map((r) => r.length), [10, 9, 7]);
  const ru = [..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя"];
  assert.deepEqual(keyRows(ru).map((r) => r.length), [10, 10, 10, 3]);
  assert.equal(keyRows(ru).flat().join(""), ru.join(""), "every letter once, in order");
});
test("hangman: the guesser in turn guesses, the setter in turn sets; the mask's _ is a hidden slot; tried letters are used", () => {
  const w = { setter: 2, alphabet: null, word: null, mask: "ka__e", guessed: ["k", "a", "e", "q"], misses: 1 };
  const g = hangmanView(w, 1, true);
  assert.equal(g.mode, "guess");
  assert.deepEqual(g.slots, ["k", "a", null, null, "e"]);
  assert.deepEqual(g.rows[0].filter((k) => k.used).map((k) => k.letter), ["q", "e"]);
  assert.equal(hangmanView(w, 1, false).mode, "wait");
  assert.equal(hangmanView(w, 2, true).mode, "wait", "the setter never guesses their own word, even in turn");
  assert.equal(hangmanView({ ...w, mask: null }, 2, true).mode, "set", "no word yet: the setter in turn sets it");
  assert.equal(hangmanView({ ...w, mask: null }, 1, true).mode, "wait");
  assert.deepEqual(hangmanView({ ...w, word: "kalle" }, 2, false).slots, ["k", "a", "l", "l", "e"], "the setter sees the word whole");
});

test("reversi: 64 cells, rank 8 first; a legal cell is one that turns a piece of theirs, as the node's rule", () => {
  // the opening: mine on d5, e4; theirs on d4, e5 (relay newReversi with me low)
  const open = { cells: { d5: { seat: 1, piece: "O" }, e4: { seat: 1, piece: "O" }, d4: { seat: 2, piece: "O" }, e5: { seat: 2, piece: "O" } }, rules: "reversi" };
  const cells = reversiCells(open, 1);
  assert.equal(cells.length, 64);
  assert.deepEqual([cells[0].id, cells[63].id], ["a8", "h1"]);
  assert.deepEqual(cells.filter((c) => c.legal).map((c) => c.id).sort(), ["c4", "d3", "e6", "f5"], "the four opening moves of the first seat");
  assert.equal(cells.find((c) => c.id === "d5")?.stand, "mine");
  assert.equal(cells.find((c) => c.id === "d4")?.legal, false, "a taken cell is never a move");
  // a run of theirs that reaches the edge without mine behind it turns nothing
  const edge = { cells: { a1: { seat: 2, piece: "O" }, b1: { seat: 2, piece: "O" } }, rules: "reversi" };
  assert.equal(reversiCells(edge, 1).find((c) => c.id === "c1")?.legal, false);
});

test("checkers and chess squares: 64, tinted where the men stand (a1, b8 — the node's start), a chess letter, none for a pawn or a man", () => {
  const g = { cells: { a8: { seat: 2, piece: "R" }, b7: { seat: 2, piece: "P" }, d4: { seat: 1, piece: "M" } } };
  const sq = squares(g, 1);
  assert.equal(sq.length, 64);
  assert.deepEqual([sq[0].id, sq[0].tint, sq[1].id, sq[1].tint], ["a8", false, "b8", true]);
  assert.equal(sq.find((s) => s.id === "a1")?.tint, true, "a1 is where the node sets the first man");
  assert.equal(sq.filter((s) => s.tint).length, 32);
  assert.deepEqual(["a8", "b7", "d4"].map((id) => sq.find((s) => s.id === id)?.letter), ["R", "", ""]);
  assert.equal(sq.find((s) => s.id === "d4")?.stand, "mine");
});
test("a tap: my piece picks it (twice drops it); picked, a square not mine is the move; mine again picks that one", () => {
  const g = { cells: { d4: { seat: 1, piece: "M" }, c3: { seat: 1, piece: "M" }, e5: { seat: 2, piece: "M" } } };
  assert.deepEqual(tapSquare(g, 1, null, "d4"), { picked: "d4" });
  assert.deepEqual(tapSquare(g, 1, "d4", "d4"), { picked: null });
  assert.deepEqual(tapSquare(g, 1, "d4", "c3"), { picked: "c3" }, "another of mine: picks that one, no move");
  assert.deepEqual(tapSquare(g, 1, "d4", "e5"), { picked: null, move: { from: "d4", to: "e5" } }, "onto theirs: the move (a take)");
  assert.deepEqual(tapSquare(g, 1, "d4", "d5"), { picked: null, move: { from: "d4", to: "d5" } });
  assert.deepEqual(tapSquare(g, 1, null, "e5"), { picked: null }, "nothing picked: theirs does nothing");
});

test("dice: pips as dice are drawn (5 the corners and the middle, 6 two columns); my turn rolls, then says the move is made", () => {
  assert.deepEqual(pipsOf(5), [0, 2, 4, 6, 8]);
  assert.deepEqual(pipsOf(6), [0, 2, 3, 5, 6, 8]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((f) => pipsOf(f).length), [1, 2, 3, 4, 5, 6]);
  assert.equal(diceStep({ rolled: null, claim: null }, true), "roll");
  assert.equal(diceStep({ rolled: [5, 3], claim: null }, true), "moved");
  assert.equal(diceStep({ rolled: [5, 3], claim: null }, false), null);
  assert.deepEqual(diceOf({ dice: { rolled: [5, 3], claim: null } })?.rolled, [5, 3]);
  assert.equal(diceOf({ grid: {} }), null);
});

test("dominoes: the line's doubles stand; a bone of mine fits the end a half matches (the node's rule); draw only when none fits", () => {
  const f = { hands: { "1": ["0:6", "4:5", "2:3"], "2": { count: 5 } }, boneyard: { count: 4 }, line: ["6:6", "6:3", "3:1", "1:5", "5:5"] };
  const v = dominoView(f, 1);
  assert.deepEqual(v.line.map((l) => l.double), [true, false, false, false, true]);
  assert.deepEqual(v.hand.map((h) => [h.bone, h.ends.join("+")]), [["0:6", "left"], ["4:5", "right"], ["2:3", ""]]);
  assert.equal(v.draw, false, "a bone fits: no draw");
  assert.equal(dominoView({ ...f, hands: { "1": ["2:3"] } }, 1).draw, true, "none fits and the boneyard has bones");
  assert.equal(dominoView({ ...f, hands: { "1": ["2:3"] }, boneyard: { count: 0 } }, 1).draw, false, "an empty boneyard: no draw");
  assert.deepEqual(dominoView({ ...f, line: [] }, 1).hand[0].ends, ["right"], "the first bone goes anywhere");
  assert.deepEqual(dominoView({ ...f, line: ["5:3", "3:5"] }, 1).hand[1].ends, ["left", "right"], "both ends open on a 5");
  assert.deepEqual(dominoView(f, 2).hand, [], "another's hand is only a count");
});

test("the con: in turn, claim the game; the other's claim, agree to it; mine stands waiting; not where the node keeps the rules", () => {
  const grid = (claim: number | null, rules?: string) => ({ grid: { cells: {}, claim, ...(rules ? { rules } : {}) } });
  assert.deepEqual(conStep(grid(null), 1, true), { offer: "claim", waiting: false });
  assert.deepEqual(conStep(grid(null), 1, false), { offer: null, waiting: false }, "out of turn nothing");
  assert.deepEqual(conStep(grid(2), 1, true), { offer: "agree", waiting: false });
  assert.deepEqual(conStep(grid(1), 1, false), { offer: null, waiting: true }, "my claim waits for theirs");
  assert.deepEqual(conStep(grid(null, "reversi"), 1, true), { offer: null, waiting: false }, "reversi's end is the node's");
  assert.deepEqual(conStep({ dice: { rolled: null, claim: null } }, 1, true).offer, "claim", "backgammon too");
  assert.deepEqual(conStep({ dots: { n: 4 } }, 1, true).offer, null);
});

test("a board in a talk takes a move only in my turn", () => {
  const go = () => "moved";
  assert.equal(movesIn("mine", go), go);
  assert.equal(movesIn("theirs", go), undefined);
  assert.equal(movesIn("over", go), undefined);
});

test("a watcher may apply while no round is under way, once; a player never (§6.1, the web's «apply»)", () => {
  const watcher = { seat: 3, is_playing: false };
  assert.equal(canApply(view(watcher, null)), "apply", "a watcher at a table with no round has nothing to press");
  assert.equal(canApply(view(watcher, { over: true })), "apply", "after a round the watcher cannot ask into the next");
  assert.equal(canApply(view(watcher, { turn: 1 })), null, "an application offered during a round");
  assert.equal(canApply(view({ ...watcher, lines: [{ id: "l", seat: 3, kind: "application", text: "возьмите", created_at: 1 }] }, null)), "applied");
  assert.equal(canApply(view({}, null)), null, "a player offered an application");
});

// Review 26.10: a double press on «apply» sent two applications, the second answered 409 and the person read «failed».
test("the watcher's «apply» is shut while its application is on the way", () => {
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  assert.match(screen, /disabled=\{applying\} onClick=\{\(\) => \{ setApplying\(true\);[\s\S]*?finally\(\(\) => setApplying\(false\)\)/, "«apply» can be pressed twice");
});

// Design 25.10 B5 «your turn»: only a player waiting on another player's move sees «nudge» (protocol §4.6).
test("«nudge» shows only to a player waiting on someone else's move", () => {
  assert.equal(canNudge(view({}, { turn: 2 })), true, "a player waiting on the other's move cannot nudge");
  assert.equal(canNudge(view({}, { turn: 1 })), false, "a player is offered to nudge themself");
  assert.equal(canNudge(view({ is_playing: false, seat: 3 }, { turn: 2 })), false, "a watcher is offered to nudge");
  assert.equal(canNudge(view({}, { turn: 2, over: true })), false, "a finished round offers a nudge");
  assert.equal(canNudge(view({}, { turn: null })), false, "a round not started offers a nudge");
  assert.equal(canNudge(view({}, null)), false, "a table with no board offers a nudge");
  assert.equal(canNudge(view({ seats: [{ seat: 1, name: "Alex", role: "playing" }] }, { turn: 2 })), false, "a nudge is offered to an empty seat");
});

// The foot (owner 27.10.2026, «Прототип + ввод»): the players' input row with its round send button above the state's actions.
test("the table foot: the input row with its send button sits above the state's actions", () => {
  const src = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  const foot = src.slice(src.indexOf('className="k-panel k-pad8 k-tb-foot"'));
  assert.ok(foot.indexOf('data-testid="line-input"') >= 0 && foot.indexOf('data-testid="line-input"') < foot.indexOf('{foot === "ask"'), "Table.tsx: the input row left its place above the foot's actions");
  assert.match(foot, /className="k-tk-input"[^\n]*data-testid="line-input"/, "Table.tsx: the table input is not the kit's round input");
  assert.match(foot, /type="submit" className="k-tk-send"[^\n]*data-testid="line-send"/, "Table.tsx: the input row lost its send button");
});

// The prototype's feet: *-wait «Stand · Start», *-over «Stand · Another round», a proposal, the con, a watcher, else stickers.
// Every member of Foot is read from table-logic.ts and must be both returned by footOf and drawn in Table.tsx.
test("footOf picks the prototype's foot for each state, and Table.tsx draws every foot", () => {
  const base = { proposed: false, first: "say" as const, con: false, apply: false };
  assert.equal(footOf({ ...base, proposed: true, first: "start" }), "ask", "a proposal to answer comes before the start");
  assert.equal(footOf({ ...base, first: "start" }), "start", "*-wait / *-over: Stand · Start");
  assert.equal(footOf({ ...base, con: true }), "con", "the con by agreement");
  assert.equal(footOf({ ...base, first: "like", apply: true }), "apply", "a watcher's application");
  assert.equal(footOf(base), "stickers", "the turn with nothing to agree: the sticker strip");
  const logic = readFileSync(new URL("./table-logic.ts", import.meta.url), "utf8");
  const members = [...(/export type Foot = ([^;]+);/.exec(logic)?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.equal(members.length, 5, "Foot: expected 5 members");
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  for (const m of members.filter((x) => x !== "stickers")) assert.match(screen, new RegExp(`foot === "${m}"`), `Table.tsx draws no foot for «${m}»`);
  assert.match(screen, /data-testid="foot-stand"/, "Table.tsx: the start foot lost its Stand button");
});

// The *-turn sheets put each game's own turn buttons in the foot (owner 27.10.2026, «Прототип + ввод»): roll / moved
// (tavli-turn), «Fleet ready» (battleship-place), ends and the pile (domino-turn), take / transfer / done (durak-turn), the bets (poker-turn). The boards
// portal them through <InFoot> (foot-slot.tsx) into the slot Table.tsx keeps in the foot; read from the boards' sources.
test("every game turn button sits in <InFoot>, and the table foot keeps the slot", () => {
  const files = ["boards.tsx", "boards-deck.tsx", "boards-poker.tsx", "boards-sea.tsx"].map((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n");
  const inFoot = [...files.matchAll(/<InFoot>([\s\S]*?)<\/InFoot>/g)].map((m) => m[1]).join("\n");
  const want = ["data-testid={step}", "end-left", "end-right", "\"draw\"", "\"take\"", "\"transfer\"", "\"done\"", "poker-fold", "poker-check", "poker-call", "poker-allin", "raise-go", "sea-fleet-go", "word-go"];
  const missing = want.filter((id) => !inFoot.includes(id));
  assert.deepEqual(missing, [], `turn buttons outside the foot: ${missing.join(", ")} (${want.length - missing.length} of ${want.length} in <InFoot>)`);
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  assert.match(screen, /<FootSlot\.Provider value=\{slot\}>/, "Table.tsx gives the boards no foot slot");
  assert.match(screen, /className="k-tb-acts" ref=\{setSlot\}/, "Table.tsx: the foot has no slot for the turn buttons");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.k-tb-acts:not\(:empty\) ~ \.k-ch-quick \{ display: none; \}/, "kit.css: the stickers stay under the game's buttons");
});

// foot-slot.tsx: with a slot (the table) the buttons portal into the foot; with none (a board in a chat) they stay inline.
// hangman-turn: the keyboard is a tile panel, 8 keys to a row, the rows flattened into one grid.
test("hangman keyboard: 8 tiles to a row, rows flattened", () => {
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.tg-hangman \.tg-keys \{[^}]*grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/, "kit.css: the hangman keys are not 8 to a row");
  assert.match(css, /\.tg-hangman \.tg-key-row \{ display: contents; \}/, "kit.css: the key rows still break the grid");
});

// four-turn: the foot holds 7 drop tiles, one per column, in <InFoot>, laid out 7 to a row.
test("four in a row: 7 drop tiles in the foot", () => {
  const src = readFileSync(new URL("./boards.tsx", import.meta.url), "utf8");
  const inFoot = [...src.matchAll(/<InFoot>([\s\S]*?)<\/InFoot>/g)].map((m) => m[1]).join("\n");
  assert.ok(inFoot.includes("four-drop-"), "boards.tsx: the four drop tiles are not in <InFoot>");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.k-tb-drops \{[^}]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/, "kit.css: the drop tiles are not 7 to a row");
});

// chapayev-turn: the foot holds the power bar and the «flick» tile, in <InFoot>; the bar fills by the aim's power.
test("chapayev: power bar and flick tile in the foot", () => {
  const src = readFileSync(new URL("./boards-physics.tsx", import.meta.url), "utf8");
  const inFoot = [...src.matchAll(/<InFoot>([\s\S]*?)<\/InFoot>/g)].map((m) => m[1]).join("\n");
  const missing = ["flick-power", "flick-go"].filter((id) => !inFoot.includes(id));
  assert.deepEqual(missing, [], `chapayev foot misses ${missing.join(", ")} in <InFoot>`);
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(src, /length: FLICK_MAX \}, \(_, i\) => <span key=\{i\} style=\{\{ "--i": i \}/, "boards-physics.tsx: the power is not FLICK_MAX rising steps");
  assert.match(css, /\.k-tb-power > span\[data-on\] \{ background: var\(--accent\); \}/, "kit.css: a reached power step is not lit");
});

// chapayev-turn: the board is checkered; the cells come row by row, so the strong ones are 16n+2,4,6,8 and 16n+9,11,13,15.
test("chapayev board is checkered", () => {
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  const rule = css.match(/\.tg-chapayev > \.tg-pc:is\(([^{]*)\) \{ background: var\(--tile-strong\); \}/)?.[1] ?? "";
  const got = [...rule.matchAll(/16n\+(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(got, [2, 4, 6, 8, 9, 11, 13, 15], "kit.css: the chapayev cells are not checkered");
});

// poker-turn has no raise field; «+» (raise-open) opens the poker-bet step: a range slider, «×» and the wide «raise».
test("poker: the raise is its own step behind «+», with a slider", () => {
  const src = readFileSync(new URL("./boards-poker.tsx", import.meta.url), "utf8");
  const turn = src.match(/\{raise === null\s*\?\s*\(([\s\S]*?)\)\s*:\s*\(([\s\S]*?<\/form>)/);
  assert.ok(turn, "boards-poker.tsx: no turn row / bet step switch on raise === null");
  assert.ok(!turn[1].includes("raise-input"), "poker-turn shows the raise field without «+»");
  assert.ok(turn[1].includes('data-testid="raise-open"'), "poker-turn has no «+» to open the bet");
  assert.match(turn[2], /type="range"[^\n]*data-testid="raise-input"/, "poker-bet: the raise is not a slider");
  assert.ok(turn[2].includes('data-testid="raise-close"') && turn[2].includes('data-testid="raise-go"'), "poker-bet lost «×» or «raise»");
});

// table-solo-guest: the asking neighbour is a card in place of the players, «×» refuses their seat, the pill starts a round;
// poker-bet and this card keep «×» a round 60 tile.
test("solo guest card: refuse and start, in place of the players", () => {
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  const card = screen.match(/<section className="k-panel k-pad8 k-tb-guest" data-testid="solo-guest">([\s\S]*?)<\/section>/)?.[1] ?? "";
  assert.match(card, /tables\.refuse\(tableId, guest\.seat,[^\n]*data-testid="guest-refuse"/, "the guest card has no «×» refusing the guest's seat");
  assert.match(card, /tables\.propose\(tableId, "rematch"\)[^\n]*data-testid="guest-start"/, "the guest card has no start pill");
  assert.match(screen, /\{!\(soloHere && guest\) && <section className="k-panel k-pad8 k-gp-players">/, "the players still show beside the guest card");
  assert.match(screen, /\{soloHere && soloOpen && asks && <div className="k-tb-dim" inert data-testid="solo-dim"><Solo /, "under the guest card the puzzle is gone, not pale");
  assert.match(screen, /\{!\(soloHere && soloOpen\) && <div className="tg-panel"/, "an empty board shows under the guest card");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  for (const host of [".tg-pk-bet", ".k-tb-guest"]) assert.match(css, new RegExp(`${host.replace(".", "\\.")} > \\.k-row > \\.k-tb-key \\{ flex: none; width: 60[p]x; border-radius: 30[p]x; \\}`), `kit.css: «×» in ${host} is not a round 60 tile`);
});

// battleship-place (owner 27.10.2026, «Кнопка «случайно»»): every dealt fleet keeps the node's rules — sizes 4,3,3,2,2,2,1,1,1,1,
// straight, on a1..j10, no two ships touching even at a corner; the board has the grid, «shuffle» and no text field.
test("randomFleet deals only fleets the node takes, and the board shows the grid", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const xy = (c: string) => ["abcdefghij".indexOf(c[0]), Number(c.slice(1)) - 1];
  for (let n = 0; n < 500; n++) {
    const fleet = randomFleet(rand);
    assert.deepEqual(fleet.map((s) => s.length).sort((a, b) => b - a), [4, 3, 3, 2, 2, 2, 1, 1, 1, 1], "a dealt fleet has the wrong ships");
    const owner = new Map<string, number>();
    fleet.forEach((ship, i) => {
      const p = ship.map(xy);
      assert.ok(p.every(([x, y]) => x >= 0 && x < 10 && y >= 0 && y < 10), `ship ${ship} leaves a1..j10`);
      const line = p.every(([x]) => x === p[0][0]) || p.every(([, y]) => y === p[0][1]);
      assert.ok(line, `ship ${ship} is not straight`);
      ship.forEach((c) => owner.set(c, i));
    });
    for (const [c, i] of owner) {
      const [x, y] = xy(c);
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const o = owner.get(`${"abcdefghij"[x + dx]}${y + dy + 1}`);
        assert.ok(o === undefined || o === i, `ships ${i} and ${o} touch at ${c}`);
      }
    }
  }
  assert.equal(fleetGrid(randomFleet(rand)).filter((c) => c.ship !== null).length, 20, "the grid does not show the 20 ship cells");
  // a ship of 4 across a1..d1 is one bar: inner sides joined, the ends open
  const bar = fleetGrid([["a1", "b1", "c1", "d1"]]).slice(0, 5).map((c) => `${c.join.l ? "<" : "."}${c.join.r ? ">" : "."}`).join(" ");
  assert.equal(bar, ".> <> <> <. ..", "a ship is not drawn as one bar (sides joined inside, open at the ends)");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  for (const side of ["l", "r", "u", "d"]) assert.match(css, new RegExp(`\\.tg-fleet-grid > span\\[data-${side}\\] \\{ padding-`), `kit.css: a ship does not join on side ${side}`);
  const board = readFileSync(new URL("./boards-sea.tsx", import.meta.url), "utf8");
  assert.ok(!board.includes("sea-fleet-input"), "battleship-place still asks the fleet as text");
  assert.match(board, /onClick=\{\(\) => setFleet\(randomFleet\(\)\)\} data-testid="sea-shuffle"/, "no «shuffle» dealing another fleet");
});

test("InFoot portals into the table's slot and stays inline without one", () => {
  const src = readFileSync(new URL("./foot-slot.tsx", import.meta.url), "utf8");
  assert.match(src, /return slot \? createPortal\(children, slot\) : <>\{children\}<\/>;/, "foot-slot.tsx: InFoot lost the portal or the inline fallback (the chat board would lose its buttons)");
});

// *-turn sheets: the game's turn buttons are equal icon tiles (k-tb-key, the main one data-main), the word in aria-label.
test("each game turn button is a *-turn icon tile with its word as the label", () => {
  const files = ["boards.tsx", "boards-deck.tsx", "boards-poker.tsx"].map((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n");
  const want = ["{step}", "end-left", "end-right", "\"draw\"", "\"take\"", "\"transfer\"", "\"done\"", "poker-fold", "poker-check", "poker-call", "poker-allin", "raise-open"];
  const tiles = [...files.matchAll(/<button [^\n]*className="k-tb-key"[^\n]*aria-label=\{say\([^\n]*data-testid=([^\s>]+)/g)].map((m) => m[1]).join(" ");
  const missing = want.filter((id) => !tiles.includes(id.replace(/^"|"$/g, "")));
  assert.deepEqual(missing, [], `not a labelled icon tile: ${missing.join(", ")} (${want.length - missing.length} of ${want.length})`);
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.k-tb-key \{[^}]*height: 60[p]x;[^}]*border-radius: 20[p]x;/, "kit.css: .k-tb-key lost the sheets' 60 tall, 20 round tile");
});

// tavli-turn: the turn tile and the con share one row (kit.css, the foot as a two-column grid while the slot has a button).
test("the con and a slot's turn button share one row of tiles (tavli-turn)", () => {
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  const at = '.k-tb-foot[data-foot="con"]:has(> .k-tb-acts:not(:empty))';
  assert.ok(css.includes(`${at} { display: grid; grid-template-columns: 1fr 1fr; }`), "kit.css: the con no longer joins the turn tile's row");
  assert.ok(css.includes(`${at} > form { grid-column: 1 / -1; }`), "kit.css: the input row is squeezed into one column");
  assert.ok(css.includes(`${at} .k-row > .k-cta > span {`), "kit.css: the con tile shows its word instead of the icon only");
});

// *-over sheets: an accent banner over the board with the players and their score chips, only once the round is over.
test("overBanner: the *-over banner shows the playing seats' score, and only when the round is over", () => {
  assert.equal(overBanner(view({}, { over: false })), null, "a banner while the round runs");
  const b = overBanner(view({}, { over: true, score: { "1": 2, "2": 1 } }));
  assert.deepEqual(b, { names: "Alex · Nino", chips: [{ seat: 1, n: 2 }, { seat: 2, n: 1 }] }, "the banner lost a player or a score (the watcher Dato must not show)");
  assert.deepEqual(overBanner(view({}, { over: true, score: {} }))?.chips, [], "a game with no score shows false 0 : 0 chips");
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  assert.match(screen, /\{banner && \(\s*<div className="k-tb-won" role="status" data-testid="over-banner">/, "Table.tsx draws no *-over banner");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.k-tb-won-score > span \{[^}]*background: var\(--pc-6\); color: var\(--accent\);/, "kit.css: the score digits melt into their light chip");
});
