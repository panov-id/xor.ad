// The pieces of the prototype's register screens (docs/newdesign/proto/register-1..3.html) that are not the flow: the bar
// with the title and the step dots, the field pill, the cells over one real input (the PIN's six dots, a paper code
// group's four), the PIN pad, and the paper code as four tiles.
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useId } from "react";
import { label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { CODE_GROUP, PIN_LENGTH } from "@sdk/register.ts";

/** The bar: the title in its pill with the step dots (register-1: the done ones long, on the accent); a progressbar for a reader. */
export function StepHead({ n, of, title }: { n: number; of: number; title: string }) {
  const words = say("web.register.step", { n, m: of });
  return (
    <header className="k-row k-bar">
      <div className="k-bar-title" role="progressbar" aria-valuemin={1} aria-valuemax={of} aria-valuenow={n} aria-valuetext={words} aria-label={words} data-testid="steps">
        <h1 className="k-bar-word">{title}</h1>
        <span className="k-steps" aria-hidden="true">{Array.from({ length: of }, (_, i) => <span key={i} data-done={i < n ? "yes" : undefined} />)}</span>
      </div>
    </header>
  );
}

/** A text field: its label above, the box, and what stands under it (a counter, a hint, an error). */
export function Field({ text, value, onChange, testid, kind = "text", under, maxLength, autoComplete, invalid, placeholder, icon = "me", side }: {
  text: string; value: string; onChange: (v: string) => void; testid: string; kind?: "text" | "number" | "email"; under?: ReactNode;
  maxLength?: number; autoComplete?: string; invalid?: boolean; placeholder?: string; icon?: string; side?: ReactNode;
}) {
  const id = useId();
  // register-1: the pill 60 tall on the tile, the accent ring round the one being typed, the icon, the value, the count at the right
  return (
    <div className="k-field-wrap">
      <label htmlFor={id} className="k-sub">{text}</label>
      <div className="k-pill" data-invalid={invalid ? "" : undefined}>
        <NdIcon name={icon} />
        <input id={id} type={kind === "email" ? "email" : "text"} inputMode={kind === "number" ? "numeric" : kind === "email" ? "email" : undefined} pattern={kind === "number" ? "[0-9]*" : undefined}
          autoComplete={autoComplete ?? (kind === "number" ? "off" : kind === "email" ? "email" : "nickname")} maxLength={maxLength} placeholder={placeholder} value={value} aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)} data-testid={testid} />
        {side}
      </div>
      {under}
    </div>
  );
}

/**
 * The cells of the sheets are drawn over ONE real input (its value, its paste, its keyboard): the
 * cells show the characters (a dot for a secret one), the input is the whole box, transparent.
 * `active` is the cell the next character goes to.
 */
export function Cells({ id, text, value, size, secret, onChange, onPaste, onKeyDown, inputRef, testid, describedBy, invalid }: {
  id: string; text: string; value: string; size: number; secret?: boolean; onChange: (v: string) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void; onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: (node: HTMLInputElement | null) => void; testid?: string; describedBy?: string; invalid?: boolean;
}) {
  const chars = [...value];
  return (
    <div className="k-cells" data-size={size} data-kind={secret ? "secret" : "code"} style={{ ["--cells" as string]: size }}>
      {Array.from({ length: size }, (_, i) => (
        <span key={i} className="k-cell" aria-hidden="true" data-filled={i < chars.length ? "yes" : undefined} data-active={i === Math.min(chars.length, size - 1) ? "yes" : undefined}>
          {i < chars.length ? (secret ? <i /> : chars[i]) : null}
        </span>
      ))}
      <input id={id} aria-label={text} type={secret ? "password" : "text"} inputMode={secret ? "numeric" : undefined} pattern={secret ? "[0-9]*" : undefined}
        autoComplete={secret ? "one-time-code" : "off"} autoCapitalize={secret ? undefined : "characters"} spellCheck={false}
        maxLength={secret ? size : undefined} value={value} aria-describedby={describedBy} aria-invalid={invalid || undefined}
        ref={inputRef} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} onKeyDown={onKeyDown} data-testid={testid} />
    </div>
  );
}

export const PIN_CELLS = PIN_LENGTH;

/**
 * The PIN's own pad (sheets register-2, register-2b, unlock): 1–9, then 0 and «back» in the last row, the first cell of
 * it empty. The field over it still takes the keyboard and a paste; on a touch screen the pad is the way in.
 */
export function PinPad({ onKey, disabled }: { onKey: (key: string) => void; disabled?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div className="k-pad" role="group" aria-label={say("app.pin.pad")} data-testid="pin-pad">
      {keys.map((k, i) => k === "" ? <span key={i} aria-hidden="true" /> : (
        <button key={k} type="button" className="k-key" aria-disabled={disabled || undefined}
          aria-label={k === "back" ? say("app.pin.back") : k} data-testid={`pad-${k}`} onClick={() => { if (!disabled) onKey(k); }}>
          {k === "back" ? <NdIcon name="back" /> : k}
        </button>
      ))}
    </div>
  );
}
export const CODE_CELLS = CODE_GROUP;

/** The paper code (register-3): the paper's mark and the words, then the four groups on four tiles (the text of `paper-code` is "K7QM 2XWD PL4R 9FTE"). */
export function CodePlate({ groups }: { groups: readonly string[] }) {
  return (
    <section className="k-stack k-plate">
      <div className="k-row"><NdIcon name="paper" className="k-big-icon" /><div className="k-stack"><b>{say("app.reg.your_code")}</b><span className="k-sub" data-testid="paper-say">{say("app.reg.paper_note")}</span></div></div>
      <p className="k-groups" data-testid="paper-code">
        {groups.map((g, i) => <span key={i} data-group={i + 1}>{g}{i < groups.length - 1 ? " " : ""}</span>)}
      </p>
    </section>
  );
}
