// The boards of the table classes (W12; chat spec §6, §6.1; the node's rules in
// relay/node/src/lib/tables_*.ts). Each draws board.state as the node cuts it
// for this seat — one's own hand, the others' as a number — and turns a press
// into the move the node reads. The node keeps the rules; here nothing is
// checked but what a button can offer. Kit elements only (К6): DotsGrid and
// CellsGrid, Hand, MoveInput.

import { useState } from "react";
import { dotsOf, freeEdges, type TableView } from "../../../depth/core/tables.ts";
import { say as tableSay } from "../api/me.ts";
import { say } from "../locales/say.ts";
import { CellsGrid, DotsGrid } from "../ui/Board.tsx";
import { Button } from "../ui/Button.tsx";
import { Hand, HandBone, HandCard } from "../ui/Hand.tsx";
import { MoveInput } from "../ui/MoveInput.tsx";

type Move = (move: unknown) => void;
type HandData = string[] | { count: number };

const count = (h: HandData | undefined) => (Array.isArray(h) ? h.length : h?.count ?? 0);

function Others({ view, hands }: { view: TableView; hands: Record<string, HandData> }) {
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
  const deck = view.board?.state.deck as { hands: Record<string, HandData>; stock: { count: number }; played: string[] } | undefined;
  if (!deck) return null;
  const mine = deck.hands[String(view.seat)];
  return (
    <section data-testid="deck">
      <p data-testid="played">{say("web.table.played", { card: deck.played.slice(-1)[0] ?? "—" })}</p>
      <p data-testid="stock">{say("web.table.stock", { count: deck.stock.count })}</p>
      <Others view={view} hands={deck.hands} />
      {Array.isArray(mine) && (
        <Hand label={say("web.table.hand")} data-testid="hand">
          {mine.map((card) => (
            <HandCard key={card} text={card} name={say("web.table.card", { card })} onSelect={onMove ? () => onMove({ play: card }) : undefined} />
          ))}
        </Hand>
      )}
      {onMove && <Button kind="secondary" type="button" icon="new" aria-label={say("web.table.draw_deck")} disabled={deck.stock.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw" />}
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
      {w.word && <p data-testid="my-word">{say("web.table.my_word", { word: w.word })}</p>}
      <p data-testid="guessed">{say("web.table.guessed", { letters: w.guessed.join(" ") || "—", misses: w.misses })}</p>
      {onMove && (
        <MoveInput
          legend={setting ? say("web.table.set_word") : say("web.table.guess")}
          fields={[{ label: setting ? say("web.table.set_word") : say("web.table.letter"), value, onChange: setValue, maxLength: setting ? 24 : 1, testid: "word-input" }]}
          submit={{ label: setting ? say("web.table.set") : say("web.table.guess"), icon: "check", testid: "word-go" }}
          onSubmit={() => {
            const v = value.trim();
            if (!v) return;
            onMove(setting ? { word: v } : { letter: v.slice(0, 1) });
            setValue("");
          }}
        />
      )}
    </section>
  );
}

// free (dominoes): {hands, boneyard: {count}, line: ["a:b", ...]}; a move is
// {play: bone, end: left|right} or {draw: true}.
export function FreeBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const f = view.board?.state.free as { hands: Record<string, HandData>; boneyard: { count: number }; line: string[] } | undefined;
  if (!f) return null;
  const mine = f.hands[String(view.seat)];
  return (
    <section data-testid="free">
      <p data-testid="line">{f.line.length ? f.line.map((b) => `[${b}]`).join("") : say("web.table.line_empty")}</p>
      <p data-testid="boneyard">{say("web.table.boneyard", { count: f.boneyard.count })}</p>
      <Others view={view} hands={f.hands} />
      {Array.isArray(mine) && (
        <Hand label={say("web.table.hand")} data-testid="hand">
          {mine.map((bone) => (
            <HandBone key={bone} text={bone} ends={[
              { glyph: "←", name: say("web.table.left", { bone }), onSelect: onMove ? () => onMove({ play: bone, end: "left" }) : undefined },
              { glyph: "→", name: say("web.table.right", { bone }), onSelect: onMove ? () => onMove({ play: bone, end: "right" }) : undefined },
            ]} />
          ))}
        </Hand>
      )}
      {onMove && <Button kind="secondary" type="button" icon="new" aria-label={say("web.table.draw_boneyard")} disabled={f.boneyard.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw" />}
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
  const rows = [7, 6, 5, 4, 3, 2, 1, 0].map((y) => [0, 1, 2, 3, 4, 5, 6, 7].map((x) => at(x, y)));
  // The position in words for a screen reader: what stands on which cell.
  const described = [7, 6, 5, 4, 3, 2, 1, 0].flatMap((y) => [0, 1, 2, 3, 4, 5, 6, 7]
    .filter((x) => at(x, y) !== "·")
    .map((x) => `${grid ? `${"abcdefgh"[x]}${y + 1}` : `${x}:${y}`} ${at(x, y)}`));
  const claim = grid?.claim ?? dice?.claim ?? null;
  return (
    <section data-testid="cells">
      {(grid || physics) && <CellsGrid label={say("web.table.board")} rows={rows} described={described} />}
      {dice && <p data-testid="rolled">{say("web.table.rolled", { dice: dice.rolled ? dice.rolled.join(say("web.table.and")) : say("web.table.not_rolled") })}</p>}
      {onMove && grid && (
        <MoveInput
          legend={say("table.move")}
          fields={[
            { label: say("web.table.from"), value: a, onChange: setA, maxLength: 2 },
            { label: say("web.table.to"), value: b, onChange: setB, maxLength: 2 },
          ]}
          submit={{ label: say("table.move"), icon: "open" }}
          onSubmit={() => { onMove({ from: a.trim(), to: b.trim() }); setA(""); setB(""); }}
        />
      )}
      {onMove && dice && (dice.rolled
        ? <Button kind="secondary" type="button" icon="check" aria-label={say("web.table.moved")} onClick={() => onMove({ move: true })} />
        : <Button kind="secondary" type="button" icon="random" aria-label={say("web.table.roll")} onClick={() => onMove({ roll: true })} />)}
      {onMove && physics && (
        <MoveInput
          legend={say("web.table.flick")}
          fields={[
            { label: say("web.table.piece"), value: a, onChange: setA },
            { label: say("web.table.direction"), value: b, onChange: setB },
            { label: say("web.table.power"), value: power, onChange: (v) => setPower(v.replace(/\D/g, "").slice(0, 1)) },
          ]}
          submit={{ label: say("web.table.flick"), icon: "watch" }}
          onSubmit={() => {
            const [dx, dy] = b.split(/[\s,]+/).map(Number);
            onMove({ flick: { piece: a.trim(), dir: [dx || 0, dy || 0], power: Number(power) } });
          }}
        />
      )}
      {onMove && (grid || dice) && (
        claim !== null && claim !== view.seat
          ? <Button kind="secondary" type="button" icon="check" aria-label={say("web.table.con_agree")} onClick={() => onMove({ con: "agree" })} />
          : <Button kind="secondary" type="button" icon="report" aria-label={say("web.table.con_won")} disabled={claim === view.seat} onClick={() => onMove({ con: "won" })} />
      )}
    </section>
  );
}

// Dots, moved here from Table.tsx (GC3) so the chat's game draws the same
// board by import: the table and the conversation share one drawing. The
// drawing itself is the kit's DotsGrid (ui/Board.tsx); here the table's words:
// whose a closed box is — «вы» for one's own seat, else the seat's name.
export function DotsBoard({ view, onEdge }: { view: TableView; onEdge?: (edge: string) => void }) {
  const dots = dotsOf(view.board)!;
  const who = (seat: number) => (seat === view.seat ? tableSay("table.you") : view.seats.find((p) => p.seat === seat)?.name ?? `#${seat}`);
  return <DotsGrid label={tableSay("table.board")} n={dots.n} free={new Set(freeEdges(dots))} boxes={dots.boxes} who={who} mine={view.seat} onEdge={onEdge} />;
}
