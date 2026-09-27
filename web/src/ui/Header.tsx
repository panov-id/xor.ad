import type { HTMLAttributes, ReactNode } from "react";

// What a screen hangs on the live step: a role, a testid, the step's own value
// for the specs (the feed's data-step, WD8).
type StepProps = HTMLAttributes<HTMLSpanElement> & { [data: `data-${string}`]: string | undefined };

// The kit's headers (components.svg §7), 56 tall, title 20/600 at x 16.
// HeaderFeed is the header with the step (owner 2026-09-19): the place and
// how many are near as a word, «Колонаки · рядом десятки», never a number;
// the step is live for a screen reader, and its span is there before the step
// is known, so the first word is announced too. The dot stands only with a
// step. HeaderScreen: back, title, an optional word action in accent-text, a
// hairline under.
export function HeaderFeed({ place, step, action, stepProps }: { place: string; step: string; action?: ReactNode; stepProps?: StepProps }) {
  return (
    <header className="ui-header">
      <h1 className="ui-header-title">
        {place}{step ? <span aria-hidden="true"> · </span> : null}<span aria-live="polite" {...stepProps}>{step}</span>
      </h1>
      {action}
    </header>
  );
}

export function HeaderScreen({ title, onBack, backLabel = "назад", action }: { title: string; onBack?: () => void; backLabel?: string; action?: ReactNode }) {
  return (
    <header className="ui-header ui-header-rule">
      {onBack ? (
        <button type="button" className="ui-icon" aria-label={backLabel} onClick={onBack} data-testid="back">
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><path d="M26 14 L18 22 L26 30" /></svg>
        </button>
      ) : null}
      <h1 className="ui-header-title">{title}</h1>
      {action ? <span className="ui-header-action">{action}</span> : null}
    </header>
  );
}
