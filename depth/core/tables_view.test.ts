// What the table screens read off a TableView (G2): whose turn and how long,
// and which applications still wait. Pure — the live path waits for G1.
import { assertEquals } from "jsr:@std/assert@1";
import { drawDots, freeEdges, openApplications, type TableView, turnOf } from "./tables.ts";

Deno.test("the dots board draws taken edges, the closer's seat in a closed box, and the edge about to be taken", () => {
  const dots = { n: 2, edges: ["h:0:0", "h:1:0", "v:0:0", "v:0:1"], boxes: { "0:0": 1 } };
  assertEquals(drawDots(dots, "h:0:1"), [
    "·───·═══·",
    "│ 1 │    ",
    "·───·   ·",
    "         ",
    "·   ·   ·",
  ]);
  assertEquals(freeEdges(dots).length, 2 * 3 + 3 * 2 - 4, "a free edge is lost or a taken one offered");
  assertEquals(freeEdges(dots).includes("h:0:0"), false);
});

const view = (over: Partial<TableView> = {}): TableView => ({
  id: "t", class: "dots", set: "3x3", seat: 2, is_playing: true, playing: 2, watching: 0,
  seats: [{ seat: 1, name: "Аня", role: "playing" }, { seat: 2, name: "Женя", role: "playing" }],
  board: { seq: 4, state: {}, turn: 2, score: {}, expires_at: 1_000_060 },
  lines: [],
  ...over,
});

Deno.test("my turn is mine only while I play; a spectator on my seat number is not asked to move", () => {
  assertEquals(turnOf(view(), 1_000_000_000), { mine: true, name: "Женя", secondsLeft: 60 });
  assertEquals(turnOf(view({ is_playing: false }), 1_000_000_000).mine, false, "a spectator is asked to move");
  assertEquals(turnOf(view({ board: { seq: 4, state: {}, turn: 1, score: {}, expires_at: 1_000_060 } }), 1_000_000_000).name, "Аня");
});

Deno.test("a game over or gone has no turn and no clock", () => {
  assertEquals(turnOf(view({ board: null })), { mine: false, name: null, secondsLeft: null });
  assertEquals(turnOf(view({ board: { seq: 9, state: {}, turn: 2, score: {}, over: true, expires_at: 0 } })).mine, false);
});

Deno.test("an application is open while its author still watches; one who plays is not asked about", () => {
  const seats = [
    { seat: 1, name: "Аня", role: "playing" as const },
    { seat: 2, name: "Женя", role: "playing" as const },
    { seat: 3, name: "Костя", role: "watching" as const },
  ];
  const lines = [
    { id: "a", seat: 3, kind: "application" as const, text: "можно?", created_at: 1 },
    { id: "b", seat: 2, kind: "application" as const, text: "и я", created_at: 2 },
    // A refusal's seat is its author's (G1c), not the refused one's.
    { id: "c", seat: 1, kind: "refusal" as const, text: "в другой раз", created_at: 3 },
  ];
  assertEquals(openApplications(view({ seats, lines })).map((l) => l.id), ["a"]);
});

Deno.test("before the first game the board has no turn and no clock, not a zero", () => {
  const empty = view({ board: { seq: 0, state: {}, turn: null, score: {}, over: false, expires_at: null } });
  assertEquals(turnOf(empty), { mine: false, name: null, secondsLeft: null });
});
