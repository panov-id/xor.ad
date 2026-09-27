// What the table screens read off a TableView (G2): whose turn and how long,
// and which applications still wait. Pure — the live path waits for G1.
import { assertEquals } from "jsr:@std/assert@1";
import { openApplications, type TableView, turnOf } from "./tables.ts";

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

Deno.test("an application stays open until a refusal names its seat", () => {
  const lines = [
    { id: "a", seat: 3, kind: "application" as const, text: "можно?", created_at: 1 },
    { id: "b", seat: 4, kind: "application" as const, text: "и я", created_at: 2 },
    { id: "c", seat: 3, kind: "refusal" as const, text: "в другой раз", created_at: 3 },
  ];
  assertEquals(openApplications(view({ lines })).map((l) => l.id), ["b"]);
});
