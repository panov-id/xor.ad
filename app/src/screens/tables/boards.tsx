// The boards on the table's panel (sheets w3_table-*), one per game, each drawing its own part of the node's state
// (relay/node/src/lib/tables_*.ts) through table-logic.ts; a tap is a move only in turn (onMove given), the node
// refuses the rest. Testids: four, four-col-<a..g>; dots, dot, edge-<id>, box; hangman, gallows, mask, slot, key-<letter>,
// word-input, word-go; reversi, cell-<a1..h8>; squares, sq-<a1..h8>; backgammon, die, roll, moved; dominoes, line-bone, hand-bone, end-left, end-right, draw.
import { useState } from "react";
import { say } from "../../i18n";
import { type BoardState, diceOf, diceStep, dominoView, dotsLayout, dotsStateOf, fourColumns, freeOf, gridOf, hangmanView, pipsOf, reversiCells, squares, tapSquare, wordOf } from "./table-logic";

type Move = (m: unknown) => void;
export type BoardProps = { state: BoardState; seat: number; onMove?: Move };

/** The board for a game (class and set as the node names them); a board knows nothing of the screen it stands on. */
export function Board({ klass, set, ...props }: BoardProps & { klass: string; set: string }) {
  if (klass === "grid" && set === "four") return <FourBoard {...props} />;
  if (klass === "grid" && set === "reversi") return <ReversiBoard {...props} />;
  if (klass === "grid" && (set === "checkers" || set === "chess")) return <SquaresBoard {...props} chess={set === "chess"} />;
  if (klass === "dots") return <DotsBoard {...props} />;
  if (klass === "dice") return <BackgammonBoard {...props} />;
  if (klass === "free") return <DominoesBoard {...props} />;
  if (klass === "word") return <HangmanBoard {...props} />;
  return null;
}

// Four in a row (w3_table-four): 7 columns of 6, a tap anywhere in an open column drops a piece in it ({column}).
export function FourBoard({ state, seat, onMove }: BoardProps) {
  const grid = gridOf(state);
  if (!grid) return null;
  return (
    <div className="tg-four" role="group" aria-label={say("web.table.columns")} data-testid="four">
      {fourColumns(grid, seat).map((c) => (
        <button key={c.column} type="button" className="tg-col" disabled={!onMove || !c.open} onClick={() => onMove?.({ column: c.column })}
          aria-label={say("web.table.column", { col: c.column })} data-testid={`four-col-${c.column}`}>
          {c.cells.map((s, i) => <span key={i} className="tg-cell" data-stand={s} />)}
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
    <div className="tg-dots" style={{ "--n": l.n } as React.CSSProperties} role="group" aria-label={say("web.table.board")} data-testid="dots">
      {l.boxes.map((b) => <span key={`b${b.r}:${b.c}`} className="tg-box" data-stand={b.stand} style={at(b.r, b.c)} data-testid="box" />)}
      {l.edges.map((e) => (
        <button key={e.id} type="button" className="tg-edge" data-dir={e.dir} data-taken={e.taken || undefined} style={at(e.r, e.c)}
          disabled={e.taken || !onMove} onClick={() => onMove?.({ edge: e.id })} aria-label={e.id} data-testid={`edge-${e.id}`}>
          <span />
        </button>
      ))}
      {Array.from({ length: (l.n + 1) ** 2 }, (_, i) => <span key={`d${i}`} className="tg-dot" style={at(Math.floor(i / (l.n + 1)), i % (l.n + 1))} data-testid="dot" />)}
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
    <div className="tg-hangman" data-testid="hangman" data-mode={h.mode}>
      <svg className="tg-gallows" viewBox="0 0 120 160" role="img" aria-label={say("web.table.guessed", { letters: w.guessed.join(" ") || "—", misses: h.misses })} data-testid="gallows">
        {GALLOWS.filter(Boolean).map((d) => <path key={d} d={d} />)}
        {MAN.slice(0, h.misses).map((d) => <path key={d} d={d} />)}
      </svg>
      <p className="tg-mask" data-testid="mask" aria-label={h.slots.map((c) => c ?? "_").join(" ")}>
        {h.slots.map((c, i) => <span key={i} className="tg-slot" data-testid="slot">{c ?? ""}</span>)}
      </p>
      {h.mode === "set"
        ? (
          <form className="tg-set" onSubmit={(e) => { e.preventDefault(); const v = word.trim(); if (v) { onMove?.({ word: v }); setWord(""); } }}>
            <input value={word} maxLength={24} onChange={(e) => setWord(e.target.value)} aria-label={say("web.table.set_word")} placeholder={say("web.table.set_word")} data-testid="word-input" />
            <button type="submit" className="cta cta-primary" disabled={!word.trim()} data-testid="word-go">{say("web.table.set")}</button>
          </form>
        )
        : (
          <div className="tg-keys" role="group" aria-label={say("web.table.letter")}>
            {h.rows.map((row, r) => (
              <div key={r} className="tg-key-row">
                {row.map((k) => (
                  <button key={k.letter} type="button" className="tg-key" data-used={k.used || undefined} disabled={k.used || h.mode !== "guess"}
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
    <div className="tg-reversi" role="group" aria-label={say("web.table.board")} data-testid="reversi">
      {reversiCells(grid, seat).map((c) => (
        <button key={c.id} type="button" className="tg-sq" disabled={!onMove || !c.legal} onClick={() => onMove?.({ to: c.id })}
          aria-label={say(c.stand === "mine" ? "web.table.cell_mine" : c.stand === "theirs" ? "web.table.cell_theirs" : "web.table.cell_free", { cell: c.id })}
          data-testid={`cell-${c.id}`}>
          {c.stand !== "free" && <span className="tg-piece" data-stand={c.stand} />}
          {c.stand === "free" && c.legal && onMove && <span className="tg-hint" />}
        </button>
      ))}
    </div>
  );
}

// Checkers and chess (w3_table-checkers, w3_table-chess): the chequered field, the pieces (a chess piece by its letter);
// a tap picks a piece of mine (a yellow ring), the next tap on a square not mine is the move ({from, to}).
export function SquaresBoard({ state, seat, onMove, chess }: BoardProps & { chess: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const grid = gridOf(state);
  if (!grid) return null;
  const tap = (id: string) => {
    const next = tapSquare(grid, seat, picked, id);
    setPicked(next.picked);
    if (next.move) onMove?.(next.move);
  };
  return (
    <div className="tg-squares" data-chess={chess || undefined} role="group" aria-label={say("web.table.board")} data-testid="squares">
      {squares(grid, seat).map((q) => (
        <button key={q.id} type="button" className="tg-sq2" data-tint={q.tint || undefined} disabled={!onMove} onClick={() => tap(q.id)}
          aria-pressed={picked === q.id || undefined}
          aria-label={say(q.stand === "mine" ? "web.table.cell_mine" : q.stand === "theirs" ? "web.table.cell_theirs" : "web.table.cell_free", { cell: q.id })}
          data-testid={`sq-${q.id}`}>
          {q.stand !== "free" && <span className="tg-man" data-stand={q.stand} data-picked={picked === q.id || undefined}>{q.letter}</span>}
        </button>
      ))}
    </div>
  );
}

// Backgammon (w3_table-backgammon): the field (two halves of twelve points and the bar) and the node's dice. The node
// rolls and keeps no position of the men (relay tables_dice.ts: how to move on what fell stays with the people), so
// the board draws no men — what is drawn is what the node knows. In turn: roll ({roll: true}), then «move made» ({move}).
export function BackgammonBoard({ state, onMove }: BoardProps) {
  const d = diceOf(state);
  if (!d) return null;
  const step = diceStep(d, !!onMove);
  return (
    <div className="tg-bg-wrap">
      <div className="tg-bg" role="img" aria-label={d.rolled ? say("web.table.rolled", { dice: d.rolled.join(" · ") }) : say("web.table.not_rolled")} data-testid="backgammon">
        {[0, 1].map((half) => (
          <div key={half} className="tg-bg-half" data-half={half}>
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="tg-point" data-up={i >= 6 || undefined} data-tone={i % 2} />)}
          </div>
        ))}
        <span className="tg-bg-bar" />
        {d.rolled && (
          <span className="tg-dice">
            {d.rolled.map((face, i) => (
              <span key={i} className="tg-die" data-testid="die" data-face={face}>
                {Array.from({ length: 9 }, (_, k) => <span key={k} className="tg-pip" data-on={pipsOf(face).includes(k) || undefined} />)}
              </span>
            ))}
          </span>
        )}
      </div>
      {step && (
        <button type="button" className="cta cta-primary tg-dice-step" onClick={() => onMove?.(step === "roll" ? { roll: true } : { move: true })} data-testid={step}>
          {say(step === "roll" ? "web.table.roll" : "web.table.moved")}
        </button>
      )}
    </div>
  );
}

// A bone: two halves of pips (none for a blank), lying in the line or standing (a double in the line).
function Bone({ a, b, standing, testid }: { a: number; b: number; standing?: boolean; testid?: string }) {
  const half = (n: number) => <span className="tg-half">{Array.from({ length: 9 }, (_, k) => <span key={k} className="tg-dpip" data-on={pipsOf(n).includes(k) || undefined} />)}</span>;
  return <span className="tg-bone" data-standing={standing || undefined} data-testid={testid}>{half(a)}{half(b)}</span>;
}

// Dominoes (w3_table-dominoes): the line as laid (a double stands across it), then my hand. A tap on a bone that fits
// one end plays it there ({play, end}); one that fits both asks which; none fits — take one from the boneyard ({draw}).
export function DominoesBoard({ state, seat, onMove }: BoardProps) {
  const [ask, setAsk] = useState<string | null>(null);
  const f = freeOf(state);
  if (!f) return null;
  const v = dominoView(f, seat);
  const play = (bone: string, ends: Array<"left" | "right">) => {
    if (ends.length === 1) { setAsk(null); onMove?.({ play: bone, end: ends[0] }); } else if (ends.length === 2) setAsk(bone);
  };
  return (
    <div className="tg-dominoes" data-testid="dominoes">
      <div className="tg-dline" role="list" aria-label={say("web.table.board")}>
        {v.line.map((l, i) => <span key={i} role="listitem" aria-label={l.bone}><Bone a={l.a} b={l.b} standing={l.double} testid="line-bone" /></span>)}
      </div>
      <div className="tg-hand" role="group" aria-label={say("web.table.hand")}>
        {v.hand.map((h) => (
          <button key={h.bone} type="button" className="tg-hand-bone" disabled={!onMove || h.ends.length === 0} aria-pressed={ask === h.bone || undefined}
            onClick={() => play(h.bone, h.ends)} aria-label={h.bone} data-testid="hand-bone">
            <Bone a={h.a} b={h.b} />
          </button>
        ))}
      </div>
      {ask && (
        <div className="tg-ends">
          <button type="button" className="cta cta-quiet" onClick={() => { onMove?.({ play: ask, end: "left" }); setAsk(null); }} data-testid="end-left">{say("app.table.to_left")}</button>
          <button type="button" className="cta cta-quiet" onClick={() => { onMove?.({ play: ask, end: "right" }); setAsk(null); }} data-testid="end-right">{say("app.table.to_right")}</button>
        </div>
      )}
      {onMove && v.draw && <button type="button" className="cta cta-primary tg-draw" onClick={() => onMove({ draw: true })} data-testid="draw">{say("app.table.draw")}</button>}
    </div>
  );
}
