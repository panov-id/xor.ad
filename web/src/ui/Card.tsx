import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { say } from "../locales/say.ts";
import { Icon } from "./Icon.tsx";

// The kit's card (components.svg §6, comic 2026-10-01): a paper panel with an
// outline in --rim, the top-right corner cut, the hard shadow; the lean is a
// token (--comic-tilt, 0° now). "nested" is the panel-2 card of a match or a
// hint; "own" is my phrase before the verdict (Н6): dashed rim.
export type CardKind = "plain" | "nested" | "own";

// `of` is the entity the card shows (kit_RU.md §3.3): a phrase, a table, an
// offer, a match, a venue, a preview of a venue's offer. It marks the card
// (data-of, ui-card-of-*) and nothing in the name: the entity is told by the
// words inside the card (the mode, the chip), the rim is only the second channel.
// `own` (my phrase before the verdict) and `fading` (its time is nearly up)
// are states, not entities.
export type CardOf = "phrase" | "table" | "offer" | "match" | "venue" | "preview";

type Props = HTMLAttributes<HTMLElement> & { kind?: CardKind; of?: CardOf; fading?: boolean; as?: "article" | "li" | "section" };

export function Card({ kind = "plain", of, fading = false, as: Tag = "article", className, ...rest }: Props) {
  const classes = ["ui-card", kind !== "plain" ? `ui-card-${kind}` : "", of ? `ui-card-of-${of}` : "", fading ? "ui-card-fading" : "", className];
  return <Tag {...rest} data-of={of} data-fading={fading ? "true" : undefined} className={classes.filter(Boolean).join(" ")} />;
}

// The like as a gold medallion with ♥ and the count (owner 2026-10-01: no
// stars). When `on` turns true it pops — scale 0 → 1.2 → 1 in 220 ms and a
// shake (styles.css .ui-burst-pop); under prefers-reduced-motion it just
// appears. ♥ is a symbol, not a word: no new line for the dictionaries.
export function LikeBurst({ count, on, ...rest }: { count: number; on: boolean } & HTMLAttributes<HTMLSpanElement>) {
  const was = useRef(on);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (on && !was.current) setPop(true);
    was.current = on;
  }, [on]);
  return (
    <span {...rest} className={["ui-burst", on ? "ui-burst-on" : "", pop ? "ui-burst-pop" : ""].filter(Boolean).join(" ")} onAnimationEnd={() => setPop(false)}>
      {/* the storefront's mark, lit when the burst is on (owner 11.10.2026: no heart) */}
      <span className="ui-burst-heart" aria-hidden="true" data-lit={on ? "" : undefined}><Icon name="like" size={20} /></span>
      <span className="ui-burst-n" aria-hidden="true">{count}</span>
      <span className="visually-hidden">{say("web.like.count", { n: count })}</span>
    </span>
  );
}

// П16 (walkthrough 10.10.2026): a bare «♥ 1» in running text is read as «один»
// — the symbol is not a word. The count is told for the ear by its name
// («лайков: 1», one dictionary line for all counts: the colon form needs no
// plural form in any of the 17 languages); the symbol and the number are for
// the eye. For the feed's foot lines and the list of likes.
// The count beside the storefront's mark, not a heart (owner 11.10.2026); `lit` where the like is
// this person's own (the «my likes» screen) — the mark's windows burn.
export function LikeCount({ n, lit }: { n: number; lit?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="ui-icon-row" data-lit={lit ? "" : undefined}><Icon name="like" size={16} />{n}</span>
      <span className="visually-hidden">{say("web.like.count", { n })}</span>
    </>
  );
}

// P8 (panel 03.10.2026): a feed card used to be <li role="button">, which
// turns the list item into a button and the list into a list of nothing. The
// item stays an item; this transparent button covers it, takes the press and
// the keys natively, and is named by the phrase and described by the line
// under it (ids from openerIds).
export function openerIds(id: string): { text: string; foot: string } {
  const base = `card-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return { text: `${base}-text`, foot: `${base}-foot` };
}

export function CardOpen({ id, onOpen }: { id: string; onOpen: () => void }) {
  const ids = openerIds(id);
  return <button type="button" className="card-open" data-testid="card-open" aria-labelledby={ids.text} aria-describedby={ids.foot} onClick={onOpen} />;
}
