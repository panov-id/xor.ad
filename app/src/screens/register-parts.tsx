// The pieces of the register sheets (w1_register-1..3) that are not the screen's flow: the head with
// the step bars, the field with its label, the cells over one real input (the PIN's six, a paper
// code group's four), the code plate, and the foot with the reason the primary is shut.
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useId } from "react";
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { home, tag } from "../shell/icons";
import { CODE_GROUP, PIN_LENGTH } from "@sdk/register.ts";

/** The mark, "step n of m", and the bars (web StepBar: a progressbar, the words for a reader). */
export function StepHead({ n, of }: { n: number; of: number }) {
  const words = say("web.register.step", { n, m: of });
  return (
    <header className="reg-head">
      <span className="reg-mark" aria-hidden="true"><Icon d={home} /></span>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={of} aria-valuenow={n} aria-valuetext={words} aria-label={words} data-testid="steps">
        <p className="reg-step" aria-hidden="true">{label("web.register.step", { n, m: of })}</p>
        <div className="reg-bars" aria-hidden="true">
          {Array.from({ length: of }, (_, i) => <span key={i} data-done={i < n ? "yes" : undefined} />)}
        </div>
      </div>
    </header>
  );
}

/** A text field: its label above, the box, and what stands under it (a counter, a hint, an error). */
export function Field({ text, value, onChange, testid, kind = "text", under, maxLength, autoComplete, invalid }: {
  text: string; value: string; onChange: (v: string) => void; testid: string; kind?: "text" | "number"; under?: ReactNode;
  maxLength?: number; autoComplete?: string; invalid?: boolean;
}) {
  const id = useId();
  return (
    <div className="reg-field">
      <label htmlFor={id}>{text}</label>
      <input id={id} className="reg-input" type="text" inputMode={kind === "number" ? "numeric" : undefined} pattern={kind === "number" ? "[0-9]*" : undefined}
        autoComplete={autoComplete ?? (kind === "number" ? "off" : "nickname")} maxLength={maxLength} value={value} aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)} data-testid={testid} />
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
    <div className="reg-cells" data-size={size} data-kind={secret ? "secret" : "code"} style={{ ["--cells" as string]: size }}>
      {Array.from({ length: size }, (_, i) => (
        <span key={i} className="reg-cell" aria-hidden="true" data-filled={i < chars.length ? "yes" : undefined} data-active={i === Math.min(chars.length, size - 1) ? "yes" : undefined}>
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
export const CODE_CELLS = CODE_GROUP;

/** The paper code on its lime plate: the groups as the paper has them (the text of `paper-code` is "K7QM 2XWD PL4R 9FTE"). */
export function CodePlate({ groups }: { groups: readonly string[] }) {
  return (
    <section className="reg-plate">
      <p className="reg-plate-head"><Icon d={tag} /><span>{say("app.reg.your_code")}</span></p>
      <p className="reg-plate-groups" data-testid="paper-code">
        {groups.map((g, i) => <span key={i} data-group={i + 1}>{g}{i < groups.length - 1 ? " " : ""}</span>)}
      </p>
      <p className="reg-plate-note" data-testid="paper-say">{say("app.reg.paper_note")}</p>
    </section>
  );
}
