// The boards of the table classes besides dots (W12; chat spec §6, §6.1; the
// node's rules in relay/node/src/lib/tables_*.ts). Each draws board.state as
// the node cuts it for this seat — one's own hand, the others' as a number —
// and turns a press into the move the node reads. The node keeps the rules;
// here nothing is checked but what a button can offer. Words are plain labels
// until the web has its own locales (coordinator, 27.09.2026).

import { useState } from "react";
import type { TableView } from "../../../depth/core/tables.ts";
import { say } from "../locales/say.ts";

type Move = (move: unknown) => void;
type Hand = string[] | { count: number };

const count = (h: Hand | undefined) => (Array.isArray(h) ? h.length : h?.count ?? 0);

function Others({ view, hands }: { view: TableView; hands: Record<string, Hand> }) {
  return (
    <p data-testid="others">
      {view.seats.filter((s) => s.seat !== view.seat && hands[String(s.seat)] !== undefined)
        .map((s) => `${s.name}: ${count(hands[String(s.seat)])}`).join(" · ")}
    </p>
  );
}

// deck: {hands: {mine: [...], other: {count}}, stock: {count}, played: [...]};
// a move is {play: card} or {draw: true}.
export function DeckBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const deck = view.board?.state.deck as { hands: Record<string, Hand>; stock: { count: number }; played: string[] } | undefined;
  if (!deck) return null;
  const mine = deck.hands[String(view.seat)];
  return (
    <section data-testid="deck">
      <p data-testid="played">{say("web.table.played", { card: deck.played.slice(-1)[0] ?? "—" })}</p>
      <p data-testid="stock">{say("web.table.stock", { count: deck.stock.count })}</p>
      <Others view={view} hands={deck.hands} />
      {Array.isArray(mine) && (
        <ul className="hand" data-testid="hand">
          {mine.map((card) => (
            <li key={card}>
              <button type="button" disabled={!onMove} onClick={() => onMove?.({ play: card })} aria-label={say("web.table.card", { card: card })}>{card}</button>
            </li>
          ))}
        </ul>
      )}
      {onMove && <button type="button" disabled={deck.stock.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw">{say("web.table.draw_deck")}</button>}
    </section>
  );
}

// word: {setter, word (the setter's only), mask, guessed, misses}; the setter
// moves {word} first, the guesser {letter}.
export function WordBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const w = view.board?.state.word as { setter: number; word: string | null; mask: string | null; guessed: string[]; misses: number } | undefined;
  const [value, setValue] = useState("");
  if (!w) return null;
  const setting = w.mask === null && w.setter === view.seat;
  return (
    <section data-testid="word">
      <p data-testid="mask">{w.mask === null ? say("web.table.no_word") : w.mask.split("").join(" ")}</p>
      {w.word && <p className="muted" data-testid="my-word">{say("web.table.my_word", { word: w.word })}</p>}
      <p data-testid="guessed">{say("web.table.guessed", { letters: w.guessed.join(" ") || "—", misses: w.misses })}</p>
      {onMove && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return;
          onMove(setting ? { word: v } : { letter: v.slice(0, 1) });
          setValue("");
        }}>
          <input value={value} maxLength={setting ? 24 : 1} onChange={(e) => setValue(e.target.value)} aria-label={setting ? say("web.table.set_word") : say("web.table.letter")} data-testid="word-input" />
          <button type="submit" data-testid="word-go">{setting ? say("web.table.set") : say("web.table.guess")}</button>
        </form>
      )}
    </section>
  );
}

// free (dominoes): {hands, boneyard: {count}, line: ["a:b", ...]}; a move is
// {play: bone, end: left|right} or {draw: true}.
export function FreeBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const f = view.board?.state.free as { hands: Record<string, Hand>; boneyard: { count: number }; line: string[] } | undefined;
  if (!f) return null;
  const mine = f.hands[String(view.seat)];
  return (
    <section data-testid="free">
      <p data-testid="line">{f.line.length ? f.line.map((b) => `[${b}]`).join("") : say("web.table.line_empty")}</p>
      <p data-testid="boneyard">{say("web.table.boneyard", { count: f.boneyard.count })}</p>
      <Others view={view} hands={f.hands} />
      {Array.isArray(mine) && (
        <ul className="hand" data-testid="hand">
          {mine.map((bone) => (
            <li key={bone}>
              [{bone}]
              {onMove && <button type="button" onClick={() => onMove({ play: bone, end: "left" })} aria-label={say("web.table.left", { bone: bone })}>←</button>}
              {onMove && <button type="button" onClick={() => onMove({ play: bone, end: "right" })} aria-label={say("web.table.right", { bone: bone })}>→</button>}
            </li>
          ))}
        </ul>
      )}
      {onMove && <button type="button" disabled={f.boneyard.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw">{say("web.table.draw_boneyard")}</button>}
    </section>
  );
}

// One view for the cell classes: grid ({cells: {e2: {seat, piece}}}), dice
// ({rolled}) and physics ({cells: {"x:y": seat}}) — an 8×8 of what stands
// where, and the move each class reads.
export function CellsBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
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
      return c ? (c.seat === view.seat ? c.piece : c.piece.toLowerCase()) : "·";
    }
    if (physics) {
      const seat = physics.cells[`${x}:${y}`];
      return seat === undefined ? "·" : seat === view.seat ? "●" : "○";
    }
    return "";
  };
  const claim = grid?.claim ?? dice?.claim ?? null;
  return (
    <section data-testid="cells">
      {(grid || physics) && (
        <pre className="cells" aria-label={say("web.table.board")}>
          {[7, 6, 5, 4, 3, 2, 1, 0].map((y) => [0, 1, 2, 3, 4, 5, 6, 7].map((x) => at(x, y)).join(" ")).join("\n")}
        </pre>
      )}
      {dice && <p data-testid="rolled">{say("web.table.rolled", { dice: dice.rolled ? dice.rolled.join(say("web.table.and")) : say("web.table.not_rolled") })}</p>}
      {onMove && grid && (
        <form onSubmit={(e) => { e.preventDefault(); onMove({ from: a.trim(), to: b.trim() }); setA(""); setB(""); }}>
          <input value={a} onChange={(e) => setA(e.target.value)} aria-label={say("web.table.from")} maxLength={2} />
          <input value={b} onChange={(e) => setB(e.target.value)} aria-label={say("web.table.to")} maxLength={2} />
          <button type="submit">{say("table.move")}</button>
        </form>
      )}
      {onMove && dice && (dice.rolled
        ? <button type="button" onClick={() => onMove({ move: true })}>{say("web.table.moved")}</button>
        : <button type="button" onClick={() => onMove({ roll: true })}>{say("web.table.roll")}</button>)}
      {onMove && physics && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const [dx, dy] = b.split(/[\s,]+/).map(Number);
          onMove({ flick: { piece: a.trim(), dir: [dx || 0, dy || 0], power: Number(power) } });
        }}>
          <input value={a} onChange={(e) => setA(e.target.value)} aria-label={say("web.table.piece")} />
          <input value={b} onChange={(e) => setB(e.target.value)} aria-label={say("web.table.direction")} />
          <input value={power} onChange={(e) => setPower(e.target.value.replace(/\D/g, "").slice(0, 1))} aria-label={say("web.table.power")} />
          <button type="submit">{say("web.table.flick")}</button>
        </form>
      )}
      {onMove && (grid || dice) && (
        claim !== null && claim !== view.seat
          ? <button type="button" onClick={() => onMove({ con: "agree" })}>{say("web.table.con_agree")}</button>
          : <button type="button" disabled={claim === view.seat} onClick={() => onMove({ con: "won" })}>{say("web.table.con_won")}</button>
      )}
    </section>
  );
}
