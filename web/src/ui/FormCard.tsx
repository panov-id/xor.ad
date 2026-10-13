import type { CSSProperties, ReactNode } from "react";
import { Card } from "./Card.tsx";
import { ErrorLine } from "./ErrorLine.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import "./form.css";

// FormCard (strict review 11.10, «weld the adjacent»): the entry screens' form
// as one card — the header icon, an optional title, the (i) of the screen, the
// fields, and the error line INSIDE it, never under it. The brand draws the card
// (.ui-card: sosed a tile, neighbro a sticker with one shadow). `info` is one or
// more <Info>; `error` keeps the screen's data-testid="error" wrapper.
// `heading`: the title is the screen's h1 (the entry has no header bar since the
// adaptive sheets, 12.10: the step capsule stands above the card instead).
// `sub`: a line under the title that only the wide entry shows (from 1024 «step 1 of 3» in words, sheet
// adaptive-*-register-1440); the phone says it with the step capsule, so it is hidden there.
export function FormCard({ icon, title, heading, sub, info, error, children, ...rest }:
  { icon: IconName; title?: string; heading?: boolean; sub?: string; info?: ReactNode; error?: string | null; children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return (
    <Card {...rest} as="section" className="ui-form-card">
      <div className="ui-form-head">
        <span className="ui-form-icon" aria-hidden="true"><Icon name={icon} /></span>
        {title ? (heading ? <h1 className="ui-form-title">{title}</h1> : <span className="ui-form-title">{title}</span>) : null}
        {info ? <span className="ui-form-info">{info}</span> : null}
        {/* display:none on the phone (the capsule says it), read from 1024 where the capsule is gone */}
        {sub ? <p className="ui-form-sub">{sub}</p> : null}
      </div>
      {children}
      {error ? <div data-testid="error"><ErrorLine>{error}</ErrorLine></div> : null}
    </Card>
  );
}

// StepBar: where the person is in the entry, as the sheets draw it (adaptive-*-register-*):
// a capsule 132×20 at the top, the done part in the accent. The words are for a screen reader.
export function StepBar({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div className="ui-steps" role="progressbar" aria-valuemin={1} aria-valuemax={of} aria-valuenow={n} aria-valuetext={label} aria-label={label} data-testid="steps"
      style={{ "--of": of } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => <span key={i} />)}
    </div>
  );
}

// PinPair: the PIN and «ещё раз» as two strips of one plate, so that the pair
// reads as one task. The mismatch is said on the second strip (aria-invalid,
// the error line under it, inside the card that holds the pair).
export function PinPair({ children }: { children: ReactNode }) {
  return <div className="ui-pinpair">{children}</div>;
}

// CodePlate: a code shown as groups on one plate, a 1px seam between groups.
// The groups stay separated by a space in the text, so reading the plate's
// text gives the code as the paper has it.
export function CodePlate({ groups, ...rest }: { groups: readonly string[]; [data: `data-${string}`]: string | undefined }) {
  return (
    <p {...rest} className="ui-codeplate">
      {groups.map((g, i) => (
        <span key={i} data-group={i + 1}>{g}{i < groups.length - 1 ? " " : ""}</span>
      ))}
    </p>
  );
}
