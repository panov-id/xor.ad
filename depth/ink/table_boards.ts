// The boards of the table classes besides dots, in the terminal (C3; the web's
// web/src/screens/TableBoards.tsx, the same words under board.*). Each draws
// board.state as the node cuts it for this seat — one's own hand, the others'
// as a number — and turns a pick into the move the node reads. The node keeps
// the rules; `onMove` is given only on one's own turn, so off it the board is
// drawn and nothing is offered.
import { createElement as h, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "./strings.ts";
import { Form, Menu, plain } from "./parts.ts";
import type { TableView } from "../core/tables.ts";

type Move = (move: unknown) => void;
type Hand = string[] | { count: number };
const count = (hand: Hand | undefined) => (Array.isArray(hand) ? hand.length : hand?.count ?? 0);

function others(view: TableView, hands: Record<string, Hand>): string {
  return view.seats.filter((s) => s.seat !== view.seat && hands[String(s.seat)] !== undefined)
    .map((s) => `${plain(s.name, 48)}: ${count(hands[String(s.seat)])}`).join(" · ");
}

// deck: {hands, stock: {count}, played}; a move is {play: card} or {draw: true}.
function Deck({ say, view, onMove, active }: { say: Say; view: TableView; onMove?: Move; active: boolean }): ReactElement | null {
  const deck = view.board?.state.deck as { hands: Record<string, Hand>; stock: { count: number }; played: string[] } | undefined;
  if (!deck) return null;
  const mine = deck.hands[String(view.seat)];
  const cards = Array.isArray(mine) ? mine : [];
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, null, say("board.played", { card: plain(deck.played.slice(-1)[0] ?? "—", 8) })),
    h(Text, { dimColor: true }, `${say("board.stock", { count: deck.stock.count })} · ${others(view, deck.hands)}`),
    h(Text, null, cards.map((c) => `[${plain(c, 8)}]`).join(" ")),
    onMove
      ? h(Menu, {
        active,
        actions: [
          ...cards.map((c) => ({ key: `play:${c}`, label: plain(c, 8) })),
          { key: "draw", label: say("board.draw_deck"), disabled: deck.stock.count === 0 },
        ],
        onPick: (key) => onMove(key === "draw" ? { draw: true } : { play: key.slice(5) }),
      })
      : null,
  );
}

// word: {setter, word (the setter's only), mask, guessed, misses}; the setter
// moves {word} first, then the guesser {letter}.
function Word({ say, view, onMove, active }: { say: Say; view: TableView; onMove?: Move; active: boolean }): ReactElement | null {
  const w = view.board?.state.word as { setter: number; word: string | null; mask: string | null; guessed: string[]; misses: number } | undefined;
  const [value, setValue] = useState("");
  if (!w) return null;
  const setting = w.mask === null && w.setter === view.seat;
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true }, w.mask === null ? say("board.no_word") : plain(w.mask, 48).split("").join(" ")),
    w.word ? h(Text, { dimColor: true }, say("board.my_word", { word: plain(w.word, 24) })) : null,
    h(Text, { dimColor: true }, say("board.guessed", { letters: plain(w.guessed.join(" "), 80) || "—", misses: w.misses })),
    onMove
      ? h(Form, {
        active,
        fields: [{ key: "v", label: setting ? say("board.set_word") : say("board.letter"), value }],
        onChange: (_k, v) => setValue(setting ? v.slice(0, 24) : v.slice(0, 1)),
        actions: [{ key: "go", label: setting ? say("board.set") : say("board.guess"), disabled: !value.trim() }],
        onPick: () => {
          const v = value.trim();
          if (!v) return;
          onMove(setting ? { word: v } : { letter: v.slice(0, 1) });
          setValue("");
        },
      })
      : null,
  );
}

// free (dominoes): {hands, boneyard: {count}, line}; a move is
// {play: bone, end: left|right} or {draw: true}.
function Free({ say, view, onMove, active }: { say: Say; view: TableView; onMove?: Move; active: boolean }): ReactElement | null {
  const f = view.board?.state.free as { hands: Record<string, Hand>; boneyard: { count: number }; line: string[] } | undefined;
  if (!f) return null;
  const mine = f.hands[String(view.seat)];
  const bones = Array.isArray(mine) ? mine : [];
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, null, f.line.length ? f.line.map((b) => `[${plain(b, 8)}]`).join("") : say("board.line_empty")),
    h(Text, { dimColor: true }, `${say("board.boneyard", { count: f.boneyard.count })} · ${others(view, f.hands)}`),
    h(Text, null, bones.map((b) => `[${plain(b, 8)}]`).join(" ")),
    onMove
      ? h(Menu, {
        active,
        actions: [
          ...bones.flatMap((b) => [
            { key: `left:${b}`, label: say("board.left", { bone: plain(b, 8) }) },
            { key: `right:${b}`, label: say("board.right", { bone: plain(b, 8) }) },
          ]),
          { key: "draw", label: say("board.draw_boneyard"), disabled: f.boneyard.count === 0 },
        ],
        onPick: (key) => {
          if (key === "draw") return onMove({ draw: true });
          const [end, bone] = key.split(/:(.*)/s);
          onMove({ play: bone, end });
        },
      })
      : null,
  );
}

// One view for the cell classes: grid ({cells: {e2: {seat, piece}}, claim}),
// dice ({rolled, claim}) and physics ({cells: {"x:y": seat}}) — an 8×8 of what
// stands where, and the move each class reads; for grid and dice the end of a
// con is claimed ({con: "won"}) and agreed by the other ({con: "agree"}).
function Cells({ say, view, onMove, active }: { say: Say; view: TableView; onMove?: Move; active: boolean }): ReactElement | null {
  const s = view.board?.state as Record<string, unknown> | undefined;
  const grid = s?.grid as { cells: Record<string, { seat: number; piece: string }>; claim: number | null } | undefined;
  const dice = s?.dice as { rolled: [number, number] | null; claim: number | null } | undefined;
  const physics = s?.physics as { cells: Record<string, number> } | undefined;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [power, setPower] = useState("3");
  if (!grid && !dice && !physics) return null;
  const at = (x: number, y: number): string => {
    if (grid) {
      const c = grid.cells[`${"abcdefgh"[x]}${y + 1}`];
      return c ? plain(c.seat === view.seat ? c.piece : c.piece.toLowerCase(), 1) || "?" : "·";
    }
    const seat = physics!.cells[`${x}:${y}`];
    return seat === undefined ? "·" : seat === view.seat ? "●" : "○";
  };
  const claim = grid?.claim ?? dice?.claim ?? null;
  const con = (grid || dice)
    ? claim !== null && claim !== view.seat
      ? [{ key: "agree", label: say("board.con_agree") }]
      : [{ key: "won", label: say("board.con_won"), disabled: claim === view.seat }]
    : [];
  const pick = (key: string) => {
    if (!onMove) return;
    if (key === "agree") return onMove({ con: "agree" });
    if (key === "won") return onMove({ con: "won" });
    if (key === "roll") return onMove({ roll: true });
    if (key === "moved") return onMove({ move: true });
    if (key === "go" && grid) {
      onMove({ from: a.trim(), to: b.trim() });
      setA("");
      setB("");
    }
    if (key === "go" && physics) {
      const [dx, dy] = b.split(/[\s,]+/).map(Number);
      onMove({ flick: { piece: a.trim(), dir: [dx || 0, dy || 0], power: Number(power) } });
    }
  };
  return h(
    Box,
    { flexDirection: "column" },
    ...(grid || physics
      ? [7, 6, 5, 4, 3, 2, 1, 0].map((y) => h(Text, { key: `r${y}` }, `${y + 1} ${[0, 1, 2, 3, 4, 5, 6, 7].map((x) => at(x, y)).join(" ")}`))
      : []),
    grid || physics ? h(Text, { dimColor: true }, grid ? "  a b c d e f g h" : "  0 1 2 3 4 5 6 7") : null,
    dice ? h(Text, null, say("board.rolled", { dice: dice.rolled ? dice.rolled.join(say("board.and")) : say("board.not_rolled") })) : null,
    onMove && grid
      ? h(Form, {
        active,
        fields: [{ key: "a", label: say("board.from"), value: a }, { key: "b", label: say("board.to"), value: b }],
        onChange: (k, v) => (k === "a" ? setA(v.slice(0, 2)) : setB(v.slice(0, 2))),
        actions: [{ key: "go", label: say("table.move"), disabled: !a.trim() || !b.trim() }, ...con],
        onPick: pick,
      })
      : null,
    onMove && physics
      ? h(Form, {
        active,
        fields: [
          { key: "a", label: say("board.piece"), value: a },
          { key: "b", label: say("board.direction"), value: b },
          { key: "p", label: say("board.power"), value: power },
        ],
        onChange: (k, v) => (k === "a" ? setA(v) : k === "b" ? setB(v) : setPower(v.replace(/\D/g, "").slice(0, 1))),
        actions: [{ key: "go", label: say("board.flick"), disabled: !a.trim() }],
        onPick: pick,
      })
      : null,
    onMove && dice
      ? h(Menu, {
        active,
        actions: [dice.rolled ? { key: "moved", label: say("board.moved") } : { key: "roll", label: say("board.roll") }, ...con],
        onPick: pick,
      })
      : null,
  );
}

// The board for a view, or null for dots (drawn by Table) and for a class
// whose state has not come yet.
export function Board(props: { say: Say; view: TableView; onMove?: Move; active: boolean }): ReactElement | null {
  const state = props.view.board?.state as Record<string, unknown> | undefined;
  if (!state) return null;
  if (state.deck) return h(Deck, props);
  if (state.word) return h(Word, props);
  if (state.free) return h(Free, props);
  if (state.grid || state.dice || state.physics) return h(Cells, props);
  return null;
}
