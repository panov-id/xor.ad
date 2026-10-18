// Texas hold'em (sheet w3_table-poker): the five cards of the board (the dealt ones face up, the rest backs), the seats as chip
// marks round the table with their stacks, the pot between; under the panel my two cards and the five actions of the seat the
// node names — fold, check, call, all in, and a raise to a number ({raise: N}, the whole bet on the street).
// Testids: poker, board-<0..4>, pk-seat-<seat>, pot, hole, hole-<card>, poker-fold, poker-check, poker-call, poker-allin, raise-input, raise-go.
import { useState } from "react";
import { pokerOf, pokerView } from "../../../../depth/core/tables_poker.ts";
import { label, say } from "../../i18n";
import type { BoardProps } from "./boards";
import { CardBack, CardFace } from "./cards";
import { type Placed } from "./cards-logic";
import { boardSlots, CHIPS, POKER_CARD, POKER_H, POT_AT, seatSlots } from "./poker-logic";

const vars = (o: Record<string, number>) => o as unknown as React.CSSProperties;

export function PokerBoard({ state, seat, onMove }: BoardProps) {
  const p = pokerOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const v = pokerView(p, seat, !!onMove);
  const slots = seatSlots(v.seats.length);
  const who = (s: number, mine: boolean) => (mine ? label("table.you") : `#${s}`);
  return (
    <div className="tg-dk tg-pk" data-testid="poker" data-street={p.street}>
      <div className="tg-dk-stage" style={vars({ "--stage-h": POKER_H })} role="group" aria-label={say("web.table.pot", { pot: p.pot })}>
        {boardSlots(p.board).map((s, i) => (s.card ? <CardFace key={i} card={s.card} at={s.at} testid={`board-${i}`} /> : <CardBack key={i} at={s.at} testid={`board-${i}`} />))}
        <span className="tg-pk-pot" style={vars({ "--x": POT_AT.x, "--y": POT_AT.y })} data-testid="pot">{p.pot}</span>
        {v.seats.map((s, i) => (
          <span key={s.seat} className="tg-pk-seat" style={vars({ "--x": slots[i].x, "--y": slots[i].y, "--w": CHIPS.w, "--h": CHIPS.h })} data-mine={s.mine || undefined} data-folded={s.folded || undefined} data-turn={s.turn || undefined}
            data-dealer={s.dealer || undefined} role="img" data-testid={`pk-seat-${s.seat}`}
            aria-label={[say("web.table.seat_line", { name: who(s.seat, s.mine), chips: s.chips, bet: s.bet }), s.dealer ? say("web.table.dealer") : "", s.folded ? say("web.table.folded") : "", s.turn ? say("web.table.to_act") : ""].filter(Boolean).join(" · ")}>
            <span className="tg-chips-mark"><i /><i /></span>
            <span className="tg-pk-stack">{s.chips}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const HOLE_Y = 40;
const holeAt = (i: number, n: number): Placed => ({ x: 178.09 + (i - (n - 1) / 2) * (POKER_CARD.w + 10), y: HOLE_Y, ...POKER_CARD, r: 0 });

// Under the panel: my two cards, and when it is my turn the actions.
export function PokerUnder({ state, seat, onMove }: BoardProps) {
  const [raise, setRaise] = useState("");
  const p = pokerOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const v = pokerView(p, seat, !!onMove);
  const hole = v.hole;
  return (
    <>
      {hole && hole.length > 0 && (
        <div className="tg-dk tg-pk-hole" data-testid="hole">
          <div className="tg-dk-stage" style={vars({ "--stage-h": HOLE_Y * 2 })} role="group" aria-label={say("web.table.hole")}>
            {hole.map((c, i) => <CardFace key={c} card={c} at={holeAt(i, hole.length)} testid={`hole-${c}`} />)}
          </div>
        </div>
      )}
      {v.acts && onMove && (
        <div className="tg-pk-acts" role="group" aria-label={say("web.table.actions")}>
          <div className="tg-actions">
            <button type="button" className="cta cta-quiet" onClick={() => onMove({ fold: true })} data-testid="poker-fold">{say("web.table.fold")}</button>
            <button type="button" className="cta cta-primary" disabled={v.owe > 0} onClick={() => onMove({ check: true })} data-testid="poker-check">{say("web.table.check")}</button>
            <button type="button" className="cta cta-primary" disabled={v.owe <= 0} onClick={() => onMove({ call: true })} data-testid="poker-call">{say("web.table.call", { owe: v.toCall })}</button>
            <button type="button" className="cta cta-quiet" onClick={() => onMove({ allin: true })} data-testid="poker-allin">{say("web.table.allin")}</button>
          </div>
          <form className="tg-set tb-raise" onSubmit={(e) => { e.preventDefault(); if (raise) { onMove({ raise: Number(raise) }); setRaise(""); } }}>
            <input value={raise} inputMode="numeric" maxLength={6} onChange={(e) => setRaise(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label={say("web.table.raise_to", { min: v.minRaise })} placeholder={say("web.table.raise_to", { min: v.minRaise })} data-testid="raise-input" />
            <button type="submit" className="cta cta-primary" disabled={!raise} data-testid="raise-go">{say("web.table.raise_go")}</button>
          </form>
        </div>
      )}
    </>
  );
}
