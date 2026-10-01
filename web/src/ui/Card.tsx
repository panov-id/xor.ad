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
