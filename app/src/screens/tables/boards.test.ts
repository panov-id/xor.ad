// The boards' drawing rules that live in boards.tsx (read as text: node:test strips types, not JSX).
// scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dominoView, hangmanView, keyRows, squares, wordOf } from "./table-logic.ts";

// The node's state read by table-logic.ts: malformed fields draw less, they never throw (security lens 27.10).
test("hangman: a mask or word that is not a string is no word state, so the board is not drawn", () => {
  assert.equal(wordOf({ word: { guessed: [], mask: 5, word: null, setter: 0, misses: 0 } } as never), null);
  assert.equal(wordOf({ word: { guessed: [], mask: "__", word: {}, setter: 0, misses: 0 } } as never), null);
  const w = wordOf({ word: { guessed: [], mask: "a_", setter: 0, misses: 0 } } as never);
  assert.ok(w, "a mask with no word field is still a word state");
  assert.deepEqual(hangmanView(w!, 1, true).slots, ["a", null]);
});

test("hangman: the node's alphabet keys the keyboard with strings only, each once", () => {
  assert.deepEqual(keyRows(["б", "а", "а", 1, "", null] as never), [["б", "а"]]);
  assert.equal(keyRows([1, 2] as never).flat().length, 26, "no letter at all falls back to English");
});

test("checkers and chess: a piece that is not a string shows no letter", () => {
  const sq = squares({ cells: { a1: { seat: 1, piece: { x: 1 } }, c1: { seat: 1, piece: "K" } }, claim: null } as never, 1);
  assert.equal(sq.find((q) => q.id === "a1")?.letter, "");
  assert.equal(sq.find((q) => q.id === "c1")?.letter, "K");
});

test("dominoes: a free state without a boneyard reads as nothing to draw", () => {
  assert.equal(dominoView({ hands: { "1": ["2:3"] }, line: ["6:6"] } as never, 1).draw, false);
});
import { missedLetters, pieceShape, yardBars } from "./boards-logic.ts";

// What the node sends is not trusted: a malformed state draws less, it never throws (security lens on TAB4).
test("hangman: missed letters skip non-strings and repeats, case-blind against the slots", () => {
  assert.deepEqual(missedLetters(["a", 7, "Q", "q", null, "Q", ""], ["A", null]), ["Q"]);
  assert.deepEqual(missedLetters(undefined, []), []);
  assert.deepEqual(missedLetters("abc", []), []);
});

test("dominoes: yard bars at most 7, none without a boneyard or with a bad count", () => {
  assert.equal(yardBars({ count: 3 }), 3);
  assert.equal(yardBars({ count: 12 }), 7);
  assert.equal(yardBars(undefined), 0);
  assert.equal(yardBars({}), 0);
  assert.equal(yardBars({ count: "5" }), 0);
  assert.equal(yardBars({ count: -2 }), 0);
});

test("chess: a letter that is not a piece of the table draws the pawn, prototype names included", () => {
  const shapes = { K: "k", "": "p" };
  assert.equal(pieceShape(shapes, "K"), "k");
  assert.equal(pieceShape(shapes, "constructor"), "p");
  assert.equal(pieceShape(shapes, "__proto__"), "p");
  assert.equal(pieceShape(shapes, "X"), "p");
});

const src = readFileSync(new URL("./boards.tsx", import.meta.url), "utf8");
const bodyBlock = src.match(/CHESS_BODY: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1] ?? "";
const BODY = new Map([...bodyBlock.matchAll(/^\s*(?:"([^"]*)"|(\w+)): "([^"]+)"/gm)].map((m) => [m[1] ?? m[2], m[3]]));

// The node's chess setup (relay/node/src/lib/tables_grid.ts newGrid): the back rank and the pawns.
const BACK = ["R", "N", "B", "Q", "K", "B", "N", "R"];

test("every letter the chess board can show has its own body, as the prototype draws it", () => {
  const cells: Record<string, { seat: number; piece: string }> = {};
  BACK.forEach((p, f) => { cells[`${"abcdefgh"[f]}1`] = { seat: 1, piece: p }; cells[`${"abcdefgh"[f]}2`] = { seat: 1, piece: "P" }; });
  const letters = new Set(squares({ cells, claim: null } as never, 1).filter((q) => q.stand !== "free").map((q) => q.letter));
  assert.equal(letters.size, 6, `six kinds on the board, got ${[...letters].join(",")}`);
  for (const l of letters) assert.ok(BODY.has(l), `boards.tsx CHESS_BODY has no body for "${l || "pawn"}": it would be drawn as a pawn`);
  const bodies = [...letters].map((l) => BODY.get(l));
  assert.equal(new Set(bodies).size, bodies.length, "two pieces share one body");
});

test("hangman as the prototype: gallows beside the missed letters and the word, the keyboard in the foot only to guess", () => {
  const hang = src.slice(src.indexOf("export function HangmanBoard"), src.indexOf("export function ReversiBoard"));
  assert.match(hang, /tg-hang-row[\s\S]*tg-gallows[\s\S]*tg-hang-side[\s\S]*tg-misses[\s\S]*tg-mask/, "gallows, misses and word are not one row");
  assert.match(hang, /h\.mode === "guess" && \(\s*\/\/[^\n]*\n\s*<InFoot><div className="tg-keys" data-hang=""/, "the keyboard is not in the foot, or shows out of turn");
});

test("dominoes show the boneyard as bars, one per bone left, at most seven", () => {
  // the count rule itself is yardBars' test above; here only that the board draws through it
  assert.match(src, /length: yardBars\(f\.boneyard\) \}, \(_, i\) => <span key=\{i\} className="tg-yard-bone"/, "the boneyard bars are not drawn by yardBars");
});

test("hangman-word: the setter sees a hidden slot per letter typed", () => {
  assert.match(src, /h\.mode === "set" \? \[\.\.\.word\.trim\(\)\]\.map\(\(\) => null\) : h\.slots/, "the setter's slots do not follow the typed word");
});

test("a chess piece stands in the board in place of its letter", () => {
  assert.match(src, /chess \? <ChessPiece letter=\{q\.letter\}/, "SquaresBoard draws the letter, not the piece");
});

// desktop-1920 8-games tavli-turn / hangman-turn: the board fills the column's height. Scoped per board class, as the
// four-in-a-row rule: backgammon grows its field, hangman its gallows; other boards keep theirs.
test("at 1440/1920 backgammon and hangman grow to the column, scoped to their boards", () => {
  const wide = readFileSync(new URL("../../../tokens/wide.css", import.meta.url), "utf8");
  const bg = [...wide.matchAll(/\[data-screen="table"\] \.k-tb-board:has\(\.tg-bg\) \{[^}]*--tg-bg-h: (\d+)p[x]/g)].map((m) => Number(m[1]));
  assert.deepEqual(bg, [700, 960], "wide.css: the backgammon field keeps the phone's 277.6 height, a strip in a full column");
  const hg = [...wide.matchAll(/\[data-screen="table"\] \.k-tb-board:has\(\.tg-hangman\) \.tg-hang-row \.tg-gallows \{ width: (\d+)p[x]; height: (\d+)p[x];/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(hg, [[330, 440], [450, 600]], "wide.css: the gallows keeps the phone's 96x128 in a full column");
});

// desktop-1920 8-games domino-turn / chapayev-turn: dominoes grow to the column; chapayev's square board fits inside it
test("at 1440/1920 dominoes grow and chapayev fits the column, scoped to their boards", () => {
  const wide = readFileSync(new URL("../../../tokens/wide.css", import.meta.url), "utf8");
  const dom = [...wide.matchAll(/\[data-screen="table"\] \.k-tb-board:has\(\.tg-dominoes\) \{ --tg-dom-h: (\d+)p[x]; --tg-bone-long: (\d+)p[x];/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(dom, [[700, 113], [960, 155]], "wide.css: the dominoes keep the phone's bones, a strip in a full column");
  const ch = [...wide.matchAll(/\.k-tb-board:has\(\.tg-chapayev\) \.tg-chapayev \{ width: min\(100%, (\d+)p[x]\);/g)].map((m) => Number(m[1]));
  assert.deepEqual(ch, [700, 960], "wide.css: chapayev's 1fr columns make the board as high as the pane is wide, rows cut off");
});

// desktop-1920 8-games hangman-turn: the mask's slots grow with the gallows, scoped to the hangman board
test("at 1440/1920 the hangman mask grows with the gallows", () => {
  const wide = readFileSync(new URL("../../../tokens/wide.css", import.meta.url), "utf8");
  const slot = [...wide.matchAll(/\[data-screen="table"\] \.k-tb-board:has\(\.tg-hangman\) \{ --tg-slot: (\d+)p[x];/g)].map((m) => Number(m[1]));
  assert.deepEqual(slot, [58, 80], "wide.css: the mask keeps the phone's 24 slot under a full-column gallows");
});

// a short window (1440x800, 1920x1000): the fixed board heights become caps under the column; poker's square stage
// is held by the column's height too, or the board scrolls and the «game over» banner hides under the head
test("at 1440/1920 the board heights are capped by the window, poker included", () => {
  const wide = readFileSync(new URL("../../../tokens/wide.css", import.meta.url), "utf8");
  const caps = [...wide.matchAll(/\.k-tb-board:has\(\.tg-(bg|dominoes)\) \{ --tg-(?:bg|dom)-h: min\((\d+)p[x], 100dvh - (\d+)p[x]\); \}/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(caps, ["bg 700 104", "dominoes 700 104", "bg 960 120", "dominoes 960 120"], "wide.css: a fixed board height overflows a 1920x1000 window by 30");
  assert.match(wide, /\.k-tb-board:has\(\.tg-chapayev\) \.tg-chapayev \{ width: min\(100%, 960p[x], 100dvh - 120p[x]\); \}/, "wide.css: chapayev is not capped by the window");
  const pk = [...wide.matchAll(/\.k-tb-board:has\(\.tg-pk\) \.tg-pk \{ width: min\(100%, 100dvh - (\d+)p[x]\);/g)].map((m) => Number(m[1]));
  assert.deepEqual(pk, [200, 220], "wide.css: the poker stage passes the column; the board scrolls under the head");
});
