// Texas hold'em (sheet w3_table-poker): the five cards of the board (the dealt ones face up, the rest backs), the seats as chip
// marks round the table with their stacks, the pot between; under the panel my two cards and the five actions of the seat the
// node names — fold, check, call, all in, and a raise to a number ({raise: N}, the whole bet on the street).
// Testids: poker, board-<0..4>, pk-seat-<seat>, pot, hole, hole-<card>, poker-fold, poker-check, poker-call, poker-allin, raise-input, raise-go.
import { useState } from "react";
import { pokerOf, pokerView } from "../../../../depth/core/tables_poker.ts";
import { label, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { InFoot } from "./foot-slot";
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
  // poker-bet: the raise is its own step behind «+» — a slider from the least raise to all my chips, «×» and «raise»
  const [raise, setRaise] = useState<number | null>(null);
  const p = pokerOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const v = pokerView(p, seat, !!onMove);
  const hole = v.hole;
  const me = v.seats.find((s) => s.mine);
  const most = me ? me.chips + me.bet : v.minRaise;
  return (
    <>
      {hole && hole.length > 0 && (
        <div className="tg-dk tg-pk-hole" data-testid="hole">
          <div className="tg-dk-stage" style={vars({ "--stage-h": HOLE_Y * 2 })} role="group" aria-label={say("web.table.hole")}>
            {hole.map((c, i) => <CardFace key={c} card={c} at={holeAt(i, hole.length)} testid={`hole-${c}`} />)}
          </div>
        </div>
      )}
      {v.acts && onMove && (<InFoot>
        <div className="tg-pk-acts" role="group" aria-label={say("web.table.actions")}>
          {raise === null
            ? (
              <div className="k-row tg-actions">
                <button type="button" className="k-tb-key" aria-label={say("web.table.fold")} onClick={() => onMove({ fold: true })} data-testid="poker-fold"><NdIcon name="close" /></button>
                <button type="button" className="k-tb-key" disabled={v.owe > 0} aria-label={say("web.table.check")} onClick={() => onMove({ check: true })} data-testid="poker-check"><NdIcon name="check" /></button>
                <button type="button" className="k-tb-key" disabled={v.owe <= 0} aria-label={say("web.table.call", { owe: v.toCall })} onClick={() => onMove({ call: true })} data-testid="poker-call"><NdIcon name="deal" /></button>
                <button type="button" className="k-tb-key" aria-label={say("web.table.allin")} onClick={() => onMove({ allin: true })} data-testid="poker-allin"><NdIcon name="wow" /></button>
                <button type="button" className="k-tb-key" data-main="" disabled={most < v.minRaise} aria-label={say("web.table.raise_legend")} onClick={() => setRaise(v.minRaise)} data-testid="raise-open"><NdIcon name="plus" /></button>
              </div>
            )
            : (
              <form className="tg-pk-bet" onSubmit={(e) => { e.preventDefault(); onMove({ raise }); setRaise(null); }}>
                <label className="tg-pk-slide">
                  <input type="range" min={v.minRaise} max={most} step={1} value={raise} onChange={(e) => setRaise(Number(e.target.value))} aria-label={say("web.table.raise_to", { min: v.minRaise })} data-testid="raise-input" />
                  <output data-testid="raise-value">{raise}</output>
                </label>
                <div className="k-row">
                  <button type="button" className="k-tb-key" aria-label={say("web.offer.cancel")} onClick={() => setRaise(null)} data-testid="raise-close"><NdIcon name="close" /></button>
                  <button type="submit" className="k-cta" aria-label={say("web.table.raise_go")} data-testid="raise-go"><NdIcon name="plus" /><span>{say("web.table.raise_go")} {raise}</span></button>
                </div>
              </form>
            )}
        </div>
      </InFoot>)}
    </>
  );
}
