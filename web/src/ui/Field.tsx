import { useState, type ClipboardEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";
import { type ControlState, useControl } from "./control.tsx";
import "./form.css";

// Field (kit_RU.md §3.2): name = the <label for>, a placeholder is not a name;
// role textbox; the kind picks the keyboard and the autocomplete token
// (WCAG 1.3.5); target --control-h; the second channel of an error is the word
// «ошибка:» and the --err rim.
export type FieldKind = "text" | "number" | "email" | "decimal" | "datetime" | "url";

const KINDS: Record<FieldKind, { type: string; inputMode?: "numeric" | "decimal" | "email" | "url"; pattern?: string; autoComplete: string }> = {
  text: { type: "text", autoComplete: "nickname" },
  number: { type: "text", inputMode: "numeric", pattern: "[0-9]*", autoComplete: "off" },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  decimal: { type: "text", inputMode: "decimal", autoComplete: "off" },
  datetime: { type: "datetime-local", autoComplete: "off" },
  url: { type: "url", inputMode: "url", autoComplete: "url" },
};

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "value" | "onChange" | "disabled" | "inputMode" | "readOnly">;
type FieldProps = Native & ControlState & { label: string; kind?: FieldKind; value: string; onChange: (value: string) => void };

export function Field({ label, kind = "text", value, onChange, hint, error, disabled, reason, busy, autoComplete, ...rest }: FieldProps) {
  const c = useControl({ hint, error, disabled, reason, busy });
  const k = KINDS[kind];
  return (
    <div className="ui-field">
      <label htmlFor={c.ids.input}>{label}</label>
      <input {...rest} {...c.attrs} readOnly={c.readOnly} className="ui-input" type={k.type} inputMode={k.inputMode} pattern={k.pattern}
        autoComplete={autoComplete ?? k.autoComplete} value={value} onChange={(event) => onChange(event.target.value)} />
      {c.notes}
    </div>
  );
}

// FieldGroup: a fieldset; the legend names the group, Tab enters at the first field.
export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="ui-fieldgroup">
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

// PinField: one <input>, six digits, hidden until «показать»; a paste is read
// whole (WCAG 3.3.8), anything that is not a digit falls out of it; Enter is the
// form's own submit. A pair «PIN / ещё раз» is two PinFields.
const PIN_LENGTH = 6;
const digits = (text: string) => text.replace(/\D/g, "").slice(0, PIN_LENGTH);

export function PinField({ label = say("web.ui.pinName"), value, onChange, hint, error, disabled, reason, busy, ...rest }:
  Omit<Native, "maxLength" | "autoComplete"> & ControlState & { label?: string; value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  const c = useControl({ hint, error, disabled, reason, busy });
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (!disabled) onChange(digits(event.clipboardData.getData("text")));
  };
  return (
    <div className="ui-field">
      <label htmlFor={c.ids.input}>{label}</label>
      <div className="ui-pin-row">
        <input {...rest} {...c.attrs} readOnly={c.readOnly} className="ui-input ui-pin-strip" type={shown ? "text" : "password"} inputMode="numeric" pattern="[0-9]*" maxLength={PIN_LENGTH}
          autoComplete="one-time-code" value={value} onChange={(event) => onChange(digits(event.target.value))} onPaste={paste} />
        <Button type="button" kind="text" onClick={() => setShown(!shown)}>{shown ? say("web.ui.hide") : say("web.ui.show")}</Button>
      </div>
      {c.notes}
    </div>
  );
}
