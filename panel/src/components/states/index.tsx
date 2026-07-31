// The three things a table can be instead of rows. They were written per page
// before, and each said something slightly different — which is how "nothing in
// this window" ended up blaming the time range for what the scope had done.
//
// An empty state that only says "empty" leaves the reader to guess whether they
// are looking at the wrong place or at a quiet day. Each of these takes the
// reason and, where there is one, the way out.

import type { ReactNode } from "react";

export const LoadingState = ({ what = "data" }: { what?: string }) => (
  <p className="state" role="status" aria-live="polite">Loading {what}…</p>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <p className="state state-error" role="alert">
    {message}
    {onRetry && <button type="button" className="state-action" onClick={onRetry}>Try again</button>}
  </p>
);

export const EmptyState = ({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="state state-empty">
    <p className="state-title">{title}</p>
    {hint && <p className="state-hint">{hint}</p>}
    {action && (
      <button type="button" className="state-action" onClick={action.onClick}>{action.label}</button>
    )}
  </div>
);
