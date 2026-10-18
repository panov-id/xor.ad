// Playing cards on a panel (sheets w3_table-durak, -poker): a face with its rank in the corner and its suit at the middle,
// a back with its inner field; placed by tables.css from the vars cards-logic.ts gives (centre, size, turn).
import type { CSSProperties } from "react";
import { cardParts, isRed, type Suit } from "../../../../depth/core/cards.ts";
import { say } from "../../i18n";
import { type Placed, placedVars } from "./cards-logic";

const PATHS: Record<Suit, string> = {
  H: "M50 100 C20 72 0 52 0 28 C0 12 12 0 27 0 C38 0 46 6 50 16 C54 6 62 0 73 0 C88 0 100 12 100 28 C100 52 80 72 50 100 Z",
  D: "M50 0 L100 50 L50 100 L0 50 Z",
  S: "M50 0 C50 0 0 40 0 62 C0 78 12 88 26 88 C36 88 44 82 46 76 C45 90 40 98 32 100 L68 100 C60 98 55 90 54 76 C56 82 64 88 74 88 C88 88 100 78 100 62 C100 40 50 0 50 0 Z",
  C: "M50 2 A22 22 0 1 1 50 46 A22 22 0 1 1 50 2 Z M24 40 A22 22 0 1 1 24 84 A22 22 0 1 1 24 40 Z M76 40 A22 22 0 1 1 76 84 A22 22 0 1 1 76 40 Z M44 60 L38 100 L62 100 L56 60 Z",
};

/** One suit's mark; its box is the ink's (the sheets size each suit apart), stretched to the box tables.css gives it. */
export function SuitMark({ suit, testid }: { suit: Suit; testid?: string }) {
  return (
    <svg className="tb-suit" data-suit={suit} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid={testid}>
      <path d={PATHS[suit]} />
    </svg>
  );
}

/** «six of hearts» in the face's own words (the dictionaries' rank and suit words), for a screen reader. */
export function cardName(card: string): string {
  const p = cardParts(card);
  return p ? say("web.table.cardName", { rank: say(`web.rank.${p.rank}`), suit: say(`web.suit.${p.suit}`) }) : card;
}

export function CardFace({ card, at, onClick, testid, extra }: { card: string; at: Placed; onClick?: () => void; testid?: string; extra?: CSSProperties }) {
  const p = cardParts(card);
  const body = p && <><span className="tb-rank" data-len={p.rank.length}>{p.rank}</span><SuitMark suit={p.suit} /></>;
  const common = { className: "tb-dk-card tb-face-card", "data-red": (p && isRed(p.suit)) || undefined, style: { ...placedVars(at), ...extra } as CSSProperties, "data-card": card, "data-testid": testid };
  return onClick
    ? <button type="button" {...common} onClick={onClick} aria-label={say("web.table.card", { card: cardName(card) })}>{body}</button>
    : <div {...common} role="img" aria-label={cardName(card)}>{body}</div>;
}

export function CardBack({ at, testid }: { at: Placed; testid?: string }) {
  return <div className="tb-dk-card tb-back" style={placedVars(at) as CSSProperties} aria-hidden="true" data-testid={testid}><span /></div>;
}
