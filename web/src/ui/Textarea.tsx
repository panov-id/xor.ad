import type { TextareaHTMLAttributes } from "react";
import { say } from "../locales/say.ts";
import { type ControlState, useControl } from "./control.tsx";

// Textarea (kit_RU.md §3.2): named by its <label for>, role textbox (multiline),
// target --control-h. With a `maxLength` the second channel is the count of what
// is left, in words, tied by aria-describedby (not a live region: it would talk
// on every key).
type Native = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "value" | "onChange" | "disabled" | "readOnly">;

export function Textarea({ label, value, onChange, hint, error, disabled, reason, busy, maxLength, ...rest }:
  Native & ControlState & { label: string; value: string; onChange: (value: string) => void }) {
  const counter = maxLength !== undefined;
  const c = useControl({ hint, error, disabled, reason, busy });
  const left = counter ? maxLength - value.length : 0;
  const described = [c.attrs["aria-describedby"], counter ? `${c.ids.input}-n` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ui-field">
      <label htmlFor={c.ids.input}>{label}</label>
      <textarea {...rest} {...c.attrs} aria-describedby={described} readOnly={c.readOnly} className="ui-textarea" maxLength={maxLength}
        value={value} onChange={(event) => onChange(event.target.value)} />
      {counter ? <p id={`${c.ids.input}-n`} className="ui-hint">{say("web.ui.remaining", { n: left })}</p> : null}
      {c.notes}
    </div>
  );
}
