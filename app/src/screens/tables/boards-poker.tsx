// Texas hold'em (prototype poker-turn): the felt an oval, the board's five slots on it (the dealt cards face up, the rest
// dashed), the pot's chip and count under them, the seats as avatars round the oval with two backs and a stack pill each -
// mine at the bottom with my two cards; under the panel the five actions of the seat the node names — fold, check, call,
// all in, and a raise to a number ({raise: N}, the whole bet on the street).
// Testids: poker, board-<0..4>, pk-seat-<seat>, pot, hole, hole-<card>, poker-fold, poker-check, poker-call, poker-allin, raise-input, raise-go.
import { useState } from "react";
import { pokerOf, pokerView } from "../../../../depth/core/tables_poker.ts";
import { label, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { InFoot } from "./foot-slot";
import type { BoardProps } from "./boards";
import { CardBack, CardFace } from "./cards";
import { placedVars } from "./cards-logic";
import { boardSlots, FELT, holeSlots, POKER_H, POT_AT, POT_CHIP, seatSlots } from "./poker-logic";

const vars = (o: Record<string, number>) => o as unknown as React.CSSProperties;

export function PokerBoard({ state, seat, onMove }: BoardProps) {
  const p = pokerOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const v = pokerView(p, seat, !!onMove);
  const slots = seatSlots(v.seats.length);
  const hole = v.hole ?? [];
  const who = (s: number, mine: boolean) => (mine ? label("table.you") : `#${s}`);
  return (
    <div className="tg-dk tg-pk" data-testid="poker" data-street={p.street}>
      <div className="tg-dk-stage" style={vars({ "--stage-h": POKER_H })} role="group" aria-label={say("web.table.pot", { pot: p.pot })}>
        <span className="tg-pk-felt" style={vars(placedVars(FELT))} aria-hidden="true" />
        {boardSlots(p.board).map((s, i) => (s.card
          ? <CardFace key={i} card={s.card} at={s.at} testid={`board-${i}`} />
          : <span key={i} className="tg-pk-slot" style={vars(placedVars(s.at))} data-testid={`board-${i}`} aria-hidden="true" />))}
        <span className="tg-pk-chip" style={vars(placedVars(POT_CHIP))} aria-hidden="true" />
        <span className="tg-pk-pot" style={vars(placedVars(POT_AT))} data-testid="pot">{p.pot}</span>
        {/* the picture has six places; a seventh seat would have no slot, so it is not drawn rather than thrown on */}
        {v.seats.slice(0, slots.length).map((s, i) => (
          <span key={s.seat} className="tg-pk-seat" data-mine={s.mine || undefined} data-folded={s.folded || undefined} data-turn={s.turn || undefined}
            data-dealer={s.dealer || undefined} role="img" data-testid={`pk-seat-${s.seat}`}
            aria-label={[say("web.table.seat_line", { name: who(s.seat, s.mine), chips: s.chips, bet: s.bet }), s.dealer ? say("web.table.dealer") : "", s.folded ? say("web.table.folded") : "", s.turn ? say("web.table.to_act") : ""].filter(Boolean).join(" · ")}>
            <span className="tg-pk-av" style={vars(placedVars(slots[i].avatar))} />
            {!(s.mine && hole.length > 0) && !s.folded && slots[i].backs.map((b, j) => <CardBack key={j} at={b} />)}
            {!s.mine && <span className="tg-pk-stack" style={vars(placedVars(slots[i].stack))}>{s.chips}</span>}
          </span>
        ))}
        {hole.length > 0 && (
          <span className="tg-dk-hand" role="group" aria-label={say("web.table.hole")} data-testid="hole">
            {holeSlots(hole.length).map((at, i) => <CardFace key={hole[i]} card={hole[i]} at={at} testid={`hole-${hole[i]}`} />)}
          </span>
        )}
      </div>
    </div>
  );
}

// Under the panel: when it is my turn, the actions.
export function PokerUnder({ state, seat, onMove }: BoardProps) {
  // poker-bet: the raise is its own step behind «+» — a slider from the least raise to all my chips, «×» and «raise»
  const [raise, setRaise] = useState<number | null>(null);
  const p = pokerOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const v = pokerView(p, seat, !!onMove);
  const me = v.seats.find((s) => s.mine);
  const most = me ? me.chips + me.bet : v.minRaise;
  return (
    <>
      {/* poker-bet.svg: the slider is its own panel above the foot (the table's under-panel); the ✕ and «raise» stay in the foot */}
      {v.acts && onMove && raise !== null && (
        <div className="k-panel k-pad8 tg-pk-slide-panel" data-testid="raise-panel">
          {/* poker-bet: the least raise at the left end, all my chips at the right, the chosen sum on the «raise» tile */}
          <label className="tg-pk-slide">
            <span className="tg-pk-end" data-testid="raise-min">{v.minRaise}</span>
            <input type="range" min={v.minRaise} max={most} step={1} value={raise} onChange={(e) => setRaise(Number(e.target.value))} aria-label={say("web.table.raise_to", { min: v.minRaise })} data-testid="raise-input" />
            <span className="tg-pk-end" data-testid="raise-max">{most}</span>
            <output hidden data-testid="raise-value">{raise}</output>
          </label>
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
