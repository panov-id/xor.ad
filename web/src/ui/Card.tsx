import type { HTMLAttributes } from "react";

// The kit's card (components.svg §6): panel fill, --r-2, no rim, 16 to the
// sides and the bottom. "nested" is the panel-2 card of a match or a hint;
// "own" is my phrase before the verdict (Н6): dashed muted rim.
export type CardKind = "plain" | "nested" | "own";

type Props = HTMLAttributes<HTMLElement> & { kind?: CardKind; as?: "article" | "li" | "section" };

export function Card({ kind = "plain", as: Tag = "article", className, ...rest }: Props) {
  return <Tag {...rest} className={["ui-card", kind !== "plain" ? `ui-card-${kind}` : "", className].filter(Boolean).join(" ")} />;
}
