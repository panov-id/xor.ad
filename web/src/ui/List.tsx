import type { ReactNode } from "react";
import { Button } from "./Button.tsx";

// List (kit_RU.md §3.3): a real list, named; Safari drops the role of a list
// whose bullets are hidden, so role=list is explicit. A row is 44 at least and
// may carry one word action («вернуть»), which is a Button text of 44.
export function List({ label, children, ...rest }: { label: string; children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return <ul {...rest} role="list" aria-label={label} className="ui-list">{children}</ul>;
}

export function ListItem({ children, action, ...rest }:
  { children: ReactNode; action?: { label: string; onSelect: () => void } } & { [data: `data-${string}`]: string | undefined }) {
  return (
    <li {...rest} className="ui-list-row">
      <span className="ui-list-text">{children}</span>
      {action ? <Button type="button" kind="text" onClick={action.onSelect}>{action.label}</Button> : null}
    </li>
  );
}
