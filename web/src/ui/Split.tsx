import type { ReactNode } from "react";

// SplitAction (strict review 11.10, «weld the adjacent»): the screen's main
// and second action in one capsule — one outline, radius h/2, a 1px seam
// between, the main first and twice as wide. Children are the kit's Buttons;
// the capsule owns their corners and widths (styles.css .ui-split).
export function Split({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="ui-split" role="group" aria-label={label}>
      {children}
    </div>
  );
}
