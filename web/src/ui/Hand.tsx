import type { ReactNode } from "react";
import { Button } from "./Button.tsx";

// Hand (kit_RU.md §3.3, К6): the cards or bones one holds, a named list of
// buttons of 44. A card is one button; a bone is the bone as text and a button
// for each end it may go to, each named in words («3:4 слева»). A hand that
// may not move yet keeps its buttons, disabled.
export function Hand({ label, children, ...rest }: { label: string; children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return <ul {...rest} role="list" aria-label={label} className="ui-hand">{children}</ul>;
}

export function HandCard({ text, name, onSelect }: { text: string; name: string; onSelect?: () => void }) {
  return (
    <li className="ui-hand-item">
      <Button kind="secondary" type="button" disabled={!onSelect} aria-label={name} onClick={onSelect}>{text}</Button>
    </li>
  );
}

export function HandBone({ text, ends }: { text: string; ends: ReadonlyArray<{ glyph: string; name: string; onSelect?: () => void }> }) {
  return (
    <li className="ui-hand-item">
      <span>[{text}]</span>
      {ends.map((end) => end.onSelect
        ? <Button key={end.name} kind="secondary" type="button" aria-label={end.name} onClick={end.onSelect}>{end.glyph}</Button>
        : null)}
    </li>
  );
}
