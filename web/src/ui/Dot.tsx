import type { HTMLAttributes } from "react";

// Dot (kit_RU.md §3.3): the «new» mark. It speaks to nobody (aria-hidden): the
// word «новое» must stand in the name of the row or the tab that wears it.
export function Dot({ className, ...rest }: Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  return <span {...rest} className={className ? `ui-dot ${className}` : "ui-dot"} aria-hidden="true" />;
}
