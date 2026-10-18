// The boards on the table's panel (sheets w3_table-*), one per game, each drawing its own part of the node's state
// (relay/node/src/lib/tables_*.ts) through table-logic.ts; a tap is a move only in turn (onMove given), the node
// refuses the rest. Testids: four, four-col-<a..g>; dots, dot, edge-<id>, box; hangman, gallows, mask, slot, key-<letter>,
// word-input, word-go; reversi, cell-<a1..h8>.
import { useState } from "react";
import { say } from "../../i18n";
import { type BoardState, dotsLayout, dotsStateOf, fourColumns, gridOf, hangmanView, reversiCells, wordOf } from "./table-logic";

type Move = (m: unknown) => void;
export type BoardProps = { state: BoardState; seat: number; onMove?: Move };

/** The board for a game (class and set as the node names them); a board knows nothing of the screen it stands on. */
export function Board({ klass, set, ...props }: BoardProps & { klass: string; set: string }) {
  if (klass === "grid" && set === "four") return <FourBoard {...props} />;
  if (klass === "grid" && set === "reversi") return <ReversiBoard {...props} />;
  if (klass === "dots") return <DotsBoard {...props} />;
  if (klass === "word") return <HangmanBoard {...props} />;
  return null;
}

// Four in a row (w3_table-four): 7 columns of 6, a tap anywhere in an open column drops a piece in it ({column}).
export function FourBoard({ state, seat, onMove }: BoardProps) {
  const grid = gridOf(state);
  if (!grid) return null;
  return (
    <div className="tb-four" role="group" aria-label={say("web.table.columns")} data-testid="four">
      {fourColumns(grid, seat).map((c) => (
        <button key={c.column} type="button" className="tb-col" disabled={!onMove || !c.open} onClick={() => onMove?.({ column: c.column })}
          aria-label={say("web.table.column", { col: c.column })} data-testid={`four-col-${c.column}`}>
          {c.cells.map((s, i) => <span key={i} className="tb-cell" data-stand={s} />)}
        </button>
      ))}
    </div>
  );
}

// Dots (w3_table-dots): the dots, the taken edges as lines, closed boxes in their owner's tone; a free edge is a press
// ({edge}) with a wide touch area around its thin line.
export function DotsBoard({ state, seat, onMove }: BoardProps) {
  const dots = dotsStateOf(state);
  if (!dots) return null;
  const l = dotsLayout(dots, seat);
  const at = (r: number, c: number) => ({ "--r": r, "--c": c }) as React.CSSProperties;
  return (
    <div className="tb-dots" style={{ "--n": l.n } as React.CSSProperties} role="group" aria-label={say("web.table.board")} data-testid="dots">
      {l.boxes.map((b) => <span key={`b${b.r}:${b.c}`} className="tb-box" data-stand={b.stand} style={at(b.r, b.c)} data-testid="box" />)}
      {l.edges.map((e) => (
        <button key={e.id} type="button" className="tb-edge" data-dir={e.dir} data-taken={e.taken || undefined} style={at(e.r, e.c)}
          disabled={e.taken || !onMove} onClick={() => onMove?.({ edge: e.id })} aria-label={e.id} data-testid={`edge-${e.id}`}>
          <span />
        </button>
      ))}
      {Array.from({ length: (l.n + 1) ** 2 }, (_, i) => <span key={`d${i}`} className="tb-dot" style={at(Math.floor(i / (l.n + 1)), i % (l.n + 1))} data-testid="dot" />)}
    </div>
  );
}

// The gallows by misses (six, relay tables_word.ts MISSES): the frame always, then head, body, two arms, two legs.
const GALLOWS = ["M10 150 H70", "M30 150 V10 H90 V30", "", "", "", "", "", ""];
const MAN = ["M90 50 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0", "M90 63 V100", "M90 75 L75 88", "M90 75 L105 88", "M90 100 L77 118", "M90 100 L103 118"];

// Hangman (w3_table-hangman): the gallows, the word as slots (a hidden letter is its underline), the keyboard of the
// set's alphabet — a tried letter is spent; the setter in turn sets the word instead ({word}, the node's moderator
// reads it), the guesser in turn taps a letter ({letter}).
export function HangmanBoard({ state, seat, onMove }: BoardProps) {
  const [word, setWord] = useState("");
  const w = wordOf(state);
  if (!w) return null;
  const h = hangmanView(w, seat, !!onMove);
  return (
    <div className="tb-hangman" data-testid="hangman" data-mode={h.mode}>
      <svg className="tb-gallows" viewBox="0 0 120 160" role="img" aria-label={say("web.table.guessed", { letters: w.guessed.join(" ") || "—", misses: h.misses })} data-testid="gallows">
        {GALLOWS.filter(Boolean).map((d) => <path key={d} d={d} />)}
        {MAN.slice(0, h.misses).map((d) => <path key={d} d={d} />)}
      </svg>
      <p className="tb-mask" data-testid="mask" aria-label={h.slots.map((c) => c ?? "_").join(" ")}>
        {h.slots.map((c, i) => <span key={i} className="tb-slot" data-testid="slot">{c ?? ""}</span>)}
      </p>
      {h.mode === "set"
        ? (
          <form className="tb-set" onSubmit={(e) => { e.preventDefault(); const v = word.trim(); if (v) { onMove?.({ word: v }); setWord(""); } }}>
            <input value={word} maxLength={24} onChange={(e) => setWord(e.target.value)} aria-label={say("web.table.set_word")} placeholder={say("web.table.set_word")} data-testid="word-input" />
            <button type="submit" className="cta cta-primary" disabled={!word.trim()} data-testid="word-go">{say("web.table.set")}</button>
          </form>
        )
        : (
          <div className="tb-keys" role="group" aria-label={say("web.table.letter")}>
            {h.rows.map((row, r) => (
              <div key={r} className="tb-key-row">
                {row.map((k) => (
                  <button key={k.letter} type="button" className="tb-key" data-used={k.used || undefined} disabled={k.used || h.mode !== "guess"}
                    onClick={() => onMove?.({ letter: k.letter })} aria-label={k.letter} data-testid={`key-${k.letter}`}>{k.used ? "" : k.letter}</button>
                ))}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// Reversi (w3_table-reversi): the 8×8 field over the whole panel, the pieces, and a dot on each cell where a piece of mine
// would turn one of theirs — the moves the node will take; a tap there is the move ({to}).
export function ReversiBoard({ state, seat, onMove }: BoardProps) {
  const grid = gridOf(state);
  if (!grid) return null;
  return (
    <div className="tb-reversi" role="group" aria-label={say("web.table.board")} data-testid="reversi">
      {reversiCells(grid, seat).map((c) => (
        <button key={c.id} type="button" className="tb-sq" disabled={!onMove || !c.legal} onClick={() => onMove?.({ to: c.id })}
          aria-label={say(c.stand === "mine" ? "web.table.cell_mine" : c.stand === "theirs" ? "web.table.cell_theirs" : "web.table.cell_free", { cell: c.id })}
          data-testid={`cell-${c.id}`}>
          {c.stand !== "free" && <span className="tb-piece" data-stand={c.stand} />}
          {c.stand === "free" && c.legal && onMove && <span className="tb-hint" />}
        </button>
      ))}
    </div>
  );
}
