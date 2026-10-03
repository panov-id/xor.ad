import { useEffect, useRef, useState, type HTMLAttributes } from "react";

// The kit's card (components.svg §6, comic 2026-10-01): a paper panel with an
// outline in --rim, the top-right corner cut, the hard shadow; the lean is a
// token (--comic-tilt, 0° now). "nested" is the panel-2 card of a match or a
// hint; "own" is my phrase before the verdict (Н6): dashed rim.
export type CardKind = "plain" | "nested" | "own";

type Props = HTMLAttributes<HTMLElement> & { kind?: CardKind; as?: "article" | "li" | "section" };

export function Card({ kind = "plain", as: Tag = "article", className, ...rest }: Props) {
  return <Tag {...rest} className={["ui-card", kind !== "plain" ? `ui-card-${kind}` : "", className].filter(Boolean).join(" ")} />;
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
      <span className="ui-burst-heart" aria-hidden="true">♥</span>
      <span className="ui-burst-n">{count}</span>
    </span>
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
