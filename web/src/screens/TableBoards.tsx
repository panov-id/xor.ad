// The boards of the table classes (W12; chat spec §6, §6.1; the node's rules in
// relay/node/src/lib/tables_*.ts). Each draws board.state as the node cuts it
// for this seat — one's own hand, the others' as a number — and turns a press
// into the move the node reads. The node keeps the rules; here nothing is
// checked but what a button can offer — except that the games whose rules the
// node keeps whole (reversi, four in a row, battleship, poker, durak) offer
// only what it would accept. Kit elements only (К6): DotsGrid, CellsGrid,
// TapGrid, Hand, MoveInput.

import { useState } from "react";
import { dotsOf, freeEdges, type TableView } from "../../../depth/core/tables.ts";
import { say as tableSay } from "../api/me.ts";
import { cardWord, dieWord } from "../api/tables.ts";
import { say } from "../locales/say.ts";
import { CellsGrid, DotsGrid, TapGrid } from "../ui/Board.tsx";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Hand, HandBone, HandCard } from "../ui/Hand.tsx";
import { MoveInput } from "../ui/MoveInput.tsx";

type Move = (move: unknown) => void;
type HandData = string[] | { count: number };

type Grid = { cells: Record<string, { seat: number; piece: string }>; claim: number | null; rules?: "reversi" | "four" };

const count = (h: HandData | undefined) => (Array.isArray(h) ? h.length : h?.count ?? 0);

function Others({ view, hands }: { view: TableView; hands: Record<string, HandData> }) {
  return (
    <p data-testid="others">
      {view.seats.filter((s) => s.seat !== view.seat && hands[String(s.seat)] !== undefined)
        .map((s) => `${s.name}: ${count(hands[String(s.seat)])}`).join(" · ")}
    </p>
  );
}

// Whose name a seat shows as: «вы» for one's own, else the seat's name.
const whoIs = (view: TableView, seat: number) =>
  seat === view.seat ? tableSay("table.you") : view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;

type DurakTable = { attack: string; beat: string | null };
type DeckState = {
  hands: Record<string, HandData>; stock: { count: number }; played: string[];
  // Durak (lib/tables_deck.ts deckFor): the face-up card (or just its suit with
  // six at the table), the pairs on the table, who attacks and who defends.
  trump?: string | null; table?: DurakTable[]; attacker?: number | null; defender?: number | null; thrower?: number | null;
  transfer?: boolean; // perevodnoy: the defender may pass an unbeaten attack on with its rank
};

// deck: {hands: {mine: [...], other: {count}}, stock: {count}, played: [...]}.
// Durak (the node's "36" set, lib/tables_deck.ts) adds trump, the table's
// attack/defence pairs and the two roles: a move is {play: card}, {take: true}
// for the defender, {done: true} for whoever holds the throw-in window once everything is beaten.
// The deck without a trump is the old generic one: {play: card} or {draw: true}.
export function DeckBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const deck = view.board?.state.deck as DeckState | undefined;
  if (!deck) return null;
  const mine = deck.hands[String(view.seat)];
  const durak = typeof deck.trump === "string" && Array.isArray(deck.table);
  const pairs = deck.table ?? [];
  const trump = deck.trump ?? "";
  const canTake = !!onMove && durak && deck.defender === view.seat && pairs.length > 0;
  // Perevodnoy: nothing beaten yet and a card of the led rank in hand — pass it on with
  // the lowest such card that is not a trump ({transfer: card}, lib/tables_deck.ts).
  const rank = (c: string) => c.slice(0, -1);
  const passOn = !!onMove && durak && deck.transfer === true && deck.defender === view.seat && pairs.length > 0 &&
      pairs.every((p) => p.beat === null) && Array.isArray(mine)
    ? [...mine].filter((c) => c.slice(0, -1) === rank(pairs[0].attack)).sort((a, b) => Number(a.slice(-1) === trump.slice(-1)) - Number(b.slice(-1) === trump.slice(-1)))[0]
    : undefined;
  const canDone = !!onMove && durak && (deck.thrower ?? deck.attacker) === view.seat && pairs.length > 0 && pairs.every((p) => p.beat !== null);
  return (
    <section data-testid="deck">
      {durak && (
        <>
          <p data-testid="trump">{/^[SHDC]$/.test(trump) ? say("web.table.trump_suit", { suit: say(`web.suit.${trump}`) }) : say("web.table.trump", { card: cardWord(trump) })}</p>
          {deck.attacker != null && deck.defender != null && (
            <p data-testid="roles">{say("web.table.roles", { attacker: whoIs(view, deck.attacker), defender: whoIs(view, deck.defender) })}</p>
          )}
        </>
      )}
      <p data-testid="played">{say("web.table.played", { card: cardWord(deck.played.slice(-1)[0] ?? "—") })}</p>
      <p data-testid="stock">{say("web.table.stock", { count: deck.stock.count })}</p>
      <Others view={view} hands={deck.hands} />
      {pairs.length > 0 && (
        <ul data-testid="pairs" aria-label={say("web.table.pairs")}>
          {pairs.map((p) => (
            <li key={p.attack} data-beaten={p.beat ? "yes" : "no"}>
              {p.beat ? say("web.table.pair", { attack: cardWord(p.attack), beat: cardWord(p.beat) }) : say("web.table.pair_open", { attack: cardWord(p.attack) })}
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(mine) && (
        <Hand label={say("web.table.hand")} data-testid="hand">
          {mine.map((card) => (
            <HandCard key={card} text={cardWord(card)} name={say("web.table.card", { card: cardWord(card) })} onSelect={onMove ? () => onMove({ play: card }) : undefined} />
          ))}
        </Hand>
      )}
      {onMove && !durak && <Button kind="secondary" type="button" icon="new" aria-label={say("web.table.draw_deck")} disabled={deck.stock.count === 0} onClick={() => onMove({ draw: true })} data-testid="draw" />}
      {(canTake || canDone || passOn) && (
        <div data-part="actions">
          {canTake && <Button kind="secondary" type="button" onClick={() => onMove!({ take: true })} data-testid="take">{say("web.table.take")}</Button>}
          {passOn && <Button kind="secondary" type="button" onClick={() => onMove!({ transfer: passOn })} data-testid="transfer">{say("web.table.transfer")}</Button>}
          {canDone && <Button kind="primary" type="button" onClick={() => onMove!({ done: true })} data-testid="done">{say("web.table.done")}</Button>}
        </div>
      )}
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
  const grid = s?.grid as Grid | undefined;
  const dice = s?.dice as { rolled: [number, number] | null; claim: number | null } | undefined;
  const physics = s?.physics as { cells: Record<string, number> } | undefined;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [power, setPower] = useState("3");
  if (!grid && !dice && !physics) return null;
  // Reversi and four in a row: the node keeps the rules whole, so no from/to
  // and no con — a tap on the cell or the column is the move.
  if (grid?.rules) return <RulesBoard view={view} grid={grid} onMove={onMove} />;
  const at =(x: number, y: number): string => {
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
      {dice && <p data-testid="rolled">{say("web.table.rolled", { dice: dice.rolled ? dice.rolled.map(dieWord).join(say("web.table.and")) : say("web.table.not_rolled") })}</p>}
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

// Reversi (8×8, a tap on a cell sends {to}) and four in a row (7×6, a column
// button sends {column}): the grid class with the node's `rules` set
// (lib/tables_reversi.ts). The position is in grid.cells as for checkers; here
// a piece is only ours (●) or the other's (○) — they have no kinds.
function RulesBoard({ view, grid, onMove }: { view: TableView; grid: Grid; onMove?: Move }) {
  const stand = (id: string) => {
    const c = grid.cells[id];
    return c ? (c.seat === view.seat ? "mine" : "theirs") : "free";
  };
  const glyph = (id: string) => ({ mine: "●", theirs: "○", free: "" })[stand(id)];
  const name = (id: string) => say(({ mine: "web.table.cell_mine", theirs: "web.table.cell_theirs", free: "web.table.cell_free" })[stand(id)], { cell: id });
  if (grid.rules === "reversi") {
    // Rank 8 on top, as the board is set; a1 bottom left.
    const ids = [8, 7, 6, 5, 4, 3, 2, 1].flatMap((r) => [..."abcdefgh"].map((f) => `${f}${r}`));
    const pieces = Object.values(grid.cells);
    return (
      <section data-testid="cells" data-rules="reversi">
        <TapGrid label={say("web.table.board")} cols={8} data-testid="reversi"
          cells={ids.map((id) => ({ id, glyph: glyph(id), name: name(id), tone: stand(id), onTap: onMove && stand(id) === "free" ? () => onMove({ to: id }) : undefined }))} />
        <p data-testid="reversi-count">
          {say("web.table.reversi_count", { mine: pieces.filter((c) => c.seat === view.seat).length, theirs: pieces.filter((c) => c.seat !== view.seat).length })}
        </p>
      </section>
    );
  }
  const files = [..."abcdefg"];
  const rows = [6, 5, 4, 3, 2, 1].map((r) => files.map((f) => glyph(`${f}${r}`) || "·"));
  const described = [6, 5, 4, 3, 2, 1].flatMap((r) => files.map((f) => `${f}${r}`)).filter((id) => stand(id) !== "free").map(name);
  return (
    <section data-testid="cells" data-rules="four">
      <CellsGrid label={say("web.table.board")} rows={rows} described={described} data-testid="four" />
      <TapGrid label={say("web.table.columns")} cols={7} data-testid="four-columns"
        cells={files.map((f) => ({ id: f, glyph: f, name: say("web.table.column", { col: f }), onTap: onMove && stand(`${f}6`) === "free" ? () => onMove({ column: f }) : undefined }))} />
    </section>
  );
}

// Battleship (lib/tables_sea.ts, state key `sea`): first each seat in turn
// places the whole fleet at once ({fleet: [["a1","a2"], …]}), typed as ships
// of cells; then a 10×10 of shots, a tap on a cell sending {shot}, and one's
// own fleet on a small grid beside it. What each seat sees is cut in seaFor:
// one's own fleet whole, the other's only as placed or not; the shots are public.
type Sea = {
  phase: "place" | "shoot";
  fleets: Record<string, string[][] | { placed: boolean }>;
  shots: Record<string, Record<string, "hit" | "miss" | "sunk">>;
};
const SEA_FILES = [..."abcdefghij"];
const SEA_CELLS = Array.from({ length: 10 }, (_, r) => SEA_FILES.map((f) => `${f}${r + 1}`));
const FLEET_EXAMPLE = "a1 a2 a3 a4; c1 c2 c3; e1 e2 e3; a6 a7; c6 c7; e6 e7; h1; h3; h5; h7";

// «a1 a2; c1» → [["a1","a2"],["c1"]]; null when a cell is not a1..j10. The
// node checks the fleet itself (sizes, straightness, no touching).
export function parseFleet(text: string): string[][] | null {
  const ships = text.split(";").map((ship) => ship.toLowerCase().split(/[\s,]+/).filter(Boolean)).filter((ship) => ship.length > 0);
  if (ships.length === 0 || ships.some((ship) => ship.some((cell) => !/^[a-j](10|[1-9])$/.test(cell)))) return null;
  return ships;
}

export function SeaBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const sea = view.board?.state.sea as Sea | undefined;
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  if (!sea) return null;
  const me = String(view.seat);
  const other = String(view.board?.state.order?.find((s) => s !== view.seat) ?? "");
  const fleet = sea.fleets[me];
  if (fleet === undefined) return null; // a watcher sees no one's sea
  const ships = Array.isArray(fleet) ? fleet : null;
  const shipAt = new Set((ships ?? []).flat());
  const mine = sea.shots[me] ?? {};
  const theirs = sea.shots[other] ?? {};
  const shotName = (cell: string, result: "hit" | "miss" | "sunk") => say(`web.table.shot_${result}`, { cell });
  const ownRows = SEA_CELLS.map((row) => row.map((c) => (shipAt.has(c) ? (theirs[c] ? "✕" : "■") : theirs[c] ? "○" : "·")));
  const ownDescribed = SEA_CELLS.flat().flatMap((c) => (theirs[c] ? [shotName(c, theirs[c])] : shipAt.has(c) ? [say("web.table.my_ship", { cell: c })] : []));
  const own = ships && <CellsGrid label={say("web.table.sea_mine")} rows={ownRows} described={ownDescribed} data-testid="sea-mine" />;
  if (sea.phase === "place") {
    return (
      <section data-testid="sea" data-phase="place">
        {ships && <p data-testid="fleet-waiting">{say("web.table.fleet_waiting")}</p>}
        {own}
        {!ships && onMove && (
          <>
            <p className="ui-hint" data-testid="fleet-hint">{say("web.table.fleet_hint", { example: FLEET_EXAMPLE })}</p>
            {bad && <ErrorLine data-testid="fleet-bad">{say("web.table.fleet_bad")}</ErrorLine>}
            <MoveInput
              legend={say("web.table.fleet_legend")}
              fields={[{ label: say("web.table.fleet"), value: text, onChange: setText, maxLength: 200, testid: "fleet-input" }]}
              submit={{ label: say("web.table.fleet_set"), icon: "check", testid: "fleet-go" }}
              onSubmit={() => {
                const parsed = parseFleet(text);
                setBad(parsed === null);
                if (parsed) onMove({ fleet: parsed });
              }}
            />
          </>
        )}
      </section>
    );
  }
  const cells = SEA_CELLS.flat().map((cell) => {
    const result = mine[cell];
    return {
      id: cell,
      glyph: result === "miss" ? "·" : result === "hit" ? "✕" : result === "sunk" ? "■" : "",
      name: result ? shotName(cell, result) : say("web.table.shoot", { cell }),
      tone: result,
      onTap: onMove && !result ? () => onMove({ shot: cell }) : undefined,
    };
  });
  return (
    <section data-testid="sea" data-phase="shoot">
      <TapGrid label={say("web.table.sea_theirs")} cols={10} cells={cells} data-testid="sea-shots" />
      {own}
    </section>
  );
}

// Texas hold'em on chips (lib/tables_poker.ts, state key `poker`): own two
// cards, the board, the pot, each seat's stack and bet, and the five actions
// of the seat the node names: fold, check, call, all-in as buttons, raise as
// a number ({raise: N} is the whole bet on this street after the raise).
type Poker = {
  chips: Record<string, number>; button: number; hand: number; street: "preflop" | "flop" | "turn" | "river";
  board: string[]; holes: Record<string, string[] | { count: number }>; bets: Record<string, number>;
  pot: number; current: number; min_raise: number; folded: number[]; to_act: number | null;
  last: { hand: number; board: string[]; shown: Record<string, string[]>; won: Record<string, number> } | null;
};

export function PokerBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const p = view.board?.state.poker as Poker | undefined;
  const [raise, setRaise] = useState("");
  if (!p) return null;
  const me = String(view.seat);
  const hole = p.holes[me];
  const owe = p.current - (p.bets[me] ?? 0);
  const acts = !!onMove && p.to_act === view.seat;
  return (
    <section data-testid="poker">
      <p data-testid="poker-head">{say("web.table.poker_head", { hand: p.hand, street: say(`web.table.street_${p.street}`) })}</p>
      <p data-testid="pot">{say("web.table.pot", { pot: p.pot })}</p>
      <p data-testid="poker-board">
        {p.board.length ? say("web.table.community", { cards: p.board.map(cardWord).join(", ") }) : say("web.table.community_none")}
      </p>
      <ul data-testid="poker-seats">
        {Object.keys(p.chips).map((seat) => (
          <li key={seat} data-seat={seat} data-turn={p.to_act === Number(seat) ? "yes" : "no"}>
            {[
              say("web.table.seat_line", { name: whoIs(view, Number(seat)), chips: p.chips[seat], bet: p.bets[seat] ?? 0 }),
              p.button === Number(seat) ? say("web.table.dealer") : "",
              p.folded.includes(Number(seat)) ? say("web.table.folded") : "",
              p.to_act === Number(seat) ? say("web.table.to_act") : "",
            ].filter(Boolean).join(" · ")}
          </li>
        ))}
      </ul>
      {Array.isArray(hole) && (
        <Hand label={say("web.table.hole")} data-testid="hole">
          {hole.map((card) => <HandCard key={card} text={cardWord(card)} name={say("web.table.card", { card: cardWord(card) })} />)}
        </Hand>
      )}
      {acts && (
        <>
          <div role="group" aria-label={say("web.table.actions")} data-part="actions">
            <Button kind="secondary" type="button" onClick={() => onMove({ fold: true })} data-testid="poker-fold">{say("web.table.fold")}</Button>
            <Button kind="primary" type="button" disabled={owe > 0} onClick={() => onMove({ check: true })} data-testid="poker-check">{say("web.table.check")}</Button>
            <Button kind="primary" type="button" disabled={owe <= 0} onClick={() => onMove({ call: true })} data-testid="poker-call">
              {say("web.table.call", { owe: Math.min(owe, p.chips[me] ?? 0) })}
            </Button>
            <Button kind="secondary" type="button" onClick={() => onMove({ allin: true })} data-testid="poker-allin">{say("web.table.allin")}</Button>
          </div>
          <MoveInput
            legend={say("web.table.raise_legend")}
            fields={[{ label: say("web.table.raise_to", { min: p.min_raise }), value: raise, onChange: (v) => setRaise(v.replace(/\D/g, "").slice(0, 6)), maxLength: 6, testid: "raise-input" }]}
            submit={{ label: say("web.table.raise_go"), icon: "check", testid: "raise-go" }}
            onSubmit={() => { if (raise) { onMove({ raise: Number(raise) }); setRaise(""); } }}
          />
        </>
      )}
      {p.last && (
        <ul data-testid="poker-last">
          {Object.entries(p.last.won).map(([seat, amount]) => (
            <li key={`w${seat}`}>{say("web.table.last_won", { hand: p.last!.hand, name: whoIs(view, Number(seat)), amount })}</li>
          ))}
          {Object.entries(p.last.shown).map(([seat, cards]) => (
            <li key={`s${seat}`}>{say("web.table.last_shown", { name: whoIs(view, Number(seat)), cards: cards.map(cardWord).join(", ") })}</li>
          ))}
        </ul>
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
  // A box shows its owner's first letter (DotsGrid); the legend says whose
  // letter is which — bare «Б · В» read as nothing, and «В» is «вы» on each
  // screen, oneself (walkthrough 11.10, С8). The ear has each box's name.
  const owners = [...new Set(Object.values(dots.boxes))];
  // From 1024 the legend stands beside the board, not under it (sheets adaptive-*-table-1440; adaptive.css).
  return (
    <div data-part="dots-board">
      <DotsGrid label={tableSay("table.board")} n={dots.n} free={new Set(freeEdges(dots))} boxes={dots.boxes} who={who} mine={view.seat} onEdge={onEdge} />
      {owners.length > 0 && (
        <p className="ui-hint" data-testid="dots-legend" aria-hidden="true">
          {owners.map((seat) => `${[...who(seat)][0]?.toLocaleUpperCase() ?? "?"} — ${who(seat)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
