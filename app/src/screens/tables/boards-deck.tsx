// Durak (prototype durak-turn): the opponents' small fans of backs in a row along the top, the stock on the left over the
// trump lying sideways under it, its count in a pill, the pairs on
// the table (an attack, the card that beats it over it), my hand in a fan along the bottom. A tap on a card of mine plays it
// ({play}) — attack, throw-in and defence are the node's to tell apart; under the panel: take, pass on (perevodnoy) and done.
// Testids: durak, opp-<seat>, stock, stock-count, trump, pair-<i>, attack-<i>, beat-<i>, hand, hand-<card>, take, transfer, done.
import { cardParts } from "../../../../depth/core/cards.ts";
import { deckOf, durakActions, isDurak } from "../../../../depth/core/tables_deck.ts";
import { say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { InFoot } from "./foot-slot";
import type { BoardProps } from "./boards";
import { CardBack, CardFace, SuitMark } from "./cards";
import { placedVars } from "./cards-logic";
import { durakView, handFan, handShift, oppFan, pairSlots, panelHeight, stockAt, stockCountAt, trumpAt } from "./durak-logic";

export function DurakBoard({ state, seat, onMove }: BoardProps) {
  const d = deckOf(state as Record<string, unknown> | null);
  if (!d || !isDurak(d)) return null;
  const v = durakView(d, seat);
  const slots = pairSlots(v.pairs);
  const trump = v.trump;
  const trumpCard = trump && cardParts(trump) ? trump : null;
  const trumpSuit = trump && /^[SHDC]$/.test(trump) ? trump as "S" | "H" | "D" | "C" : null;
  return (
    <div className="tg-dk" data-testid="durak">
      <div className="tg-dk-stage" style={{ "--stage-h": panelHeight(v.pairs.length) } as React.CSSProperties} role="group" aria-label={say("web.table.stock", { count: v.stock })}>
        {v.opps.map((o, row) => (
          <span key={o.seat} className="tg-dk-fan" data-testid={`opp-${o.seat}`} data-count={o.count} role="img" aria-label={String(o.count)}>
            {oppFan(o.count, row, v.opps.length).map((p, i) => <CardBack key={i} at={p} />)}
          </span>
        ))}
        {trumpCard && <CardFace card={trumpCard} at={trumpAt()} testid="trump" />}
        {trumpSuit && !trumpCard && (
          <span className="tg-dk-card tg-trump-suit" style={placedVars(trumpAt()) as React.CSSProperties} data-testid="trump" role="img" aria-label={say("web.table.trump_suit", { suit: say(`web.suit.${trumpSuit}`) })} data-red={trumpSuit === "H" || trumpSuit === "D" || undefined}>
            <SuitMark suit={trumpSuit} />
          </span>
        )}
        {v.stock > 0 && <CardBack at={stockAt()} testid="stock" />}
        {v.stock > 0 && <span className="tg-dk-count" style={placedVars(stockCountAt()) as React.CSSProperties} data-testid="stock-count" aria-hidden="true">{v.stock}</span>}
        {slots.map((s, i) => (
          <span key={s.attack.x + ":" + s.attack.y} className="tg-dk-pair" data-testid={`pair-${i}`} data-beaten={v.pairs[i].beat ? "yes" : "no"}>
            <CardFace card={v.pairs[i].attack} at={s.attack} testid={`attack-${i}`} />
            {s.beat && v.pairs[i].beat && <CardFace card={v.pairs[i].beat!} at={s.beat} testid={`beat-${i}`} />}
          </span>
        ))}
        <div className="tg-dk-hand" role="group" aria-label={say("web.table.hand")} data-testid="hand">
          {handFan(v.hand.length, handShift(v.pairs.length)).map((p, i) => (
            <CardFace key={v.hand[i]} card={v.hand[i]} at={p} onClick={onMove ? () => onMove({ play: v.hand[i] }) : undefined} testid={`hand-${v.hand[i]}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Under the panel: what the seat in turn may be offered besides playing a card.
export function DurakUnder({ state, seat, onMove }: BoardProps) {
  const d = deckOf(state as Record<string, unknown> | null);
  if (!d || !isDurak(d) || !onMove) return null;
  const a = durakActions(d, seat, true);
  if (!a.take && !a.transfer && !a.done) return null;
  return (
    <InFoot><div className="k-row tg-actions" data-testid="durak-actions">
      {a.take && <button type="button" className="k-tb-key" aria-label={say("web.table.take")} onClick={() => onMove({ take: true })} data-testid="take"><NdIcon name="down" /></button>}
      {a.transfer && <button type="button" className="k-tb-key" aria-label={say("web.table.transfer")} onClick={() => onMove({ transfer: a.transfer })} data-testid="transfer"><NdIcon name="chev" /></button>}
      {a.done && <button type="button" className="k-tb-key" data-main="" aria-label={say("web.table.done")} onClick={() => onMove({ done: true })} data-testid="done"><NdIcon name="check" /></button>}
    </div></InFoot>
  );
}
