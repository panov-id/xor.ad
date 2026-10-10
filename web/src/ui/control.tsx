import { useId, type ReactNode } from "react";
import { say } from "../locales/say.ts";

// What every input of the kit shares (docs/design/kit_RU.md §2): a hint and a
// counter hang on aria-describedby; an error is aria-invalid + aria-errormessage
// and says «ошибка:» first, in words, not only in --err; an unavailable control
// is aria-disabled (never `disabled`), keeps its focus, and its reason sits in
// words next to it, tied by aria-describedby; a pending one is aria-busy.
export type ControlState = {
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Why the control is unavailable: shown and described only while `disabled`. */
  reason?: string;
  busy?: boolean;
};

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} role="alert" className="ui-error">{say("web.ui.error")} {children}</p>;
}

export function useControl({ hint, error, disabled, reason, busy }: ControlState, describedBy?: string) {
  const uid = useId();
  const ids = { input: `${uid}-i`, hint: `${uid}-h`, error: `${uid}-e`, reason: `${uid}-r` };
  const described = [hint ? ids.hint : "", disabled && reason ? ids.reason : "", error ? ids.error : "", describedBy ?? ""].filter(Boolean).join(" ");
  const attrs = {
    id: ids.input,
    "aria-describedby": described || undefined,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-errormessage": error ? ids.error : undefined,
    "aria-disabled": disabled ? (true as const) : undefined,
    "aria-busy": busy ? (true as const) : undefined,
  };
  // Text inputs only: aria-disabled does not stop typing, read-only does, and the focus stays.
  const readOnly = disabled ? (true as const) : undefined;
  const notes = (
    <>
      {hint ? <p id={ids.hint} className="ui-hint">{hint}</p> : null}
      {disabled && reason ? <p id={ids.reason} className="ui-reason">{reason}</p> : null}
      {error ? <ErrorText id={ids.error}>{error}</ErrorText> : null}
    </>
  );
  return { ids, attrs, readOnly, notes };
}
