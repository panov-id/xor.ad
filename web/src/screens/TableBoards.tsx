// The boards of the table classes besides dots (W12; chat spec §6, §6.1; the
// node's rules in relay/node/src/lib/tables_*.ts). Each draws board.state as
// the node cuts it for this seat — one's own hand, the others' as a number —
// and turns a press into the move the node reads. The node keeps the rules;
// here nothing is checked but what a button can offer. Words are plain labels
// until the web has its own locales (coordinator, 27.09.2026).

import { useState } from "react";
import { dotsOf, freeEdges, type TableView } from "../../../depth/core/tables.ts";
import { say as tableSay } from "../api/me.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";

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
      {onMove && <Button kind="secondary" type="button" disabled={deck.stock.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw">{say("web.table.draw_deck")}</Button>}
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
          <Button kind="primary" type="submit" data-testid="word-go">{setting ? say("web.table.set") : say("web.table.guess")}</Button>
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
      {onMove && <Button kind="secondary" type="button" disabled={f.boneyard.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw">{say("web.table.draw_boneyard")}</Button>}
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
          <Button kind="primary" type="submit">{say("table.move")}</Button>
        </form>
      )}
      {onMove && dice && (dice.rolled
        ? <Button kind="secondary" type="button" onClick={() => onMove({ move: true })}>{say("web.table.moved")}</Button>
        : <Button kind="secondary" type="button" onClick={() => onMove({ roll: true })}>{say("web.table.roll")}</Button>)}
      {onMove && physics && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const [dx, dy] = b.split(/[\s,]+/).map(Number);
          onMove({ flick: { piece: a.trim(), dir: [dx || 0, dy || 0], power: Number(power) } });
        }}>
          <input value={a} onChange={(e) => setA(e.target.value)} aria-label={say("web.table.piece")} />
          <input value={b} onChange={(e) => setB(e.target.value)} aria-label={say("web.table.direction")} />
          <input value={power} onChange={(e) => setPower(e.target.value.replace(/\D/g, "").slice(0, 1))} aria-label={say("web.table.power")} />
          <Button kind="primary" type="submit">{say("web.table.flick")}</Button>
        </form>
      )}
      {onMove && (grid || dice) && (
        claim !== null && claim !== view.seat
          ? <Button kind="secondary" type="button" onClick={() => onMove({ con: "agree" })}>{say("web.table.con_agree")}</Button>
          : <Button kind="secondary" type="button" disabled={claim === view.seat} onClick={() => onMove({ con: "won" })}>{say("web.table.con_won")}</Button>
      )}
    </section>
  );
}

const CELL = 48, PAD = 16, HIT = 16;

// Dots, moved here from Table.tsx (GC3) so the chat's game draws the same
// board by import: the table and the conversation share one drawing.
export function DotsBoard({ view, onEdge }: { view: TableView; onEdge?: (edge: string) => void }) {
  const dots = dotsOf(view.board)!;
  const free = new Set(freeEdges(dots));
  const size = dots.n * CELL + PAD * 2;
  const edges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (let r = 0; r <= dots.n; r++) {
    for (let c = 0; c < dots.n; c++) {
      edges.push({ id: `h:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + (c + 1) * CELL, y2: PAD + r * CELL });
    }
  }
  for (let r = 0; r < dots.n; r++) {
    for (let c = 0; c <= dots.n; c++) {
      edges.push({ id: `v:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + c * CELL, y2: PAD + (r + 1) * CELL });
    }
  }
  return (
    <svg width={size} height={size} role="group" aria-label={tableSay("table.board")} data-testid="dots">
      {Object.entries(dots.boxes).map(([box, seat]) => {
        const [r, c] = box.split(":").map(Number);
        return <text key={box} x={PAD + c * CELL + CELL / 2} y={PAD + r * CELL + CELL / 2 + 5} textAnchor="middle">{seat}</text>;
      })}
      {edges.map((e) => free.has(e.id)
        ? (
          // A free edge is a rectangle along it, HIT px across: a line's box
          // is zero high or wide, and nothing but a stroke could be pressed
          // (W11). The faint line inside shows where the edge would go.
          <g key={e.id}>
            <line {...e} stroke="currentColor" strokeOpacity={onEdge ? 0.15 : 0.05} strokeWidth={3} pointerEvents="none" />
            <rect x={Math.min(e.x1, e.x2) - HIT / 2} y={Math.min(e.y1, e.y2) - HIT / 2}
              width={Math.abs(e.x2 - e.x1) + HIT} height={Math.abs(e.y2 - e.y1) + HIT} fill="transparent"
              role={onEdge ? "button" : undefined} aria-label={onEdge ? `${tableSay("table.edge")} ${e.id}` : undefined}
              data-edge={e.id} tabIndex={onEdge ? 0 : undefined} style={{ cursor: onEdge ? "pointer" : "default" }}
              onClick={onEdge ? () => onEdge(e.id) : undefined}
              onKeyDown={onEdge ? (k) => (k.key === "Enter" || k.key === " ") && onEdge(e.id) : undefined} />
          </g>
        )
        : <line key={e.id} {...e} stroke="currentColor" strokeWidth={3} data-taken={e.id} />)}
      {Array.from({ length: (dots.n + 1) ** 2 }, (_, i) => (
        <circle key={i} cx={PAD + (i % (dots.n + 1)) * CELL} cy={PAD + Math.floor(i / (dots.n + 1)) * CELL} r={3} />
      ))}
    </svg>
  );
}
