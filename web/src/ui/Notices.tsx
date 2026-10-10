import type { ReactNode } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";

// Notice (kit_RU.md §3.3): «внимание:» is its first word, role=note, no focus,
// no announcement of its own; the colour (--accent-text) is the second channel.
export function Notice({ children, ...rest }: { children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return <p {...rest} role="note" className="ui-notice">{say("web.ui.notice")} {children}</p>;
}

// EmptyState: an h2 and a line; it never takes the focus. An optional action is
// a Button of 44.
export function EmptyState({ title, line, action, ...rest }:
  { title: string; line?: string; action?: { label: string; onSelect: () => void } } & { [data: `data-${string}`]: string | undefined }) {
  return (
    <section {...rest} className="ui-empty">
      <h2 className="ui-empty-title">{title}</h2>
      {line ? <p className="ui-empty-line">{line}</p> : null}
      {action ? <Button type="button" kind="secondary" onClick={action.onSelect}>{action.label}</Button> : null}
    </section>
  );
}
