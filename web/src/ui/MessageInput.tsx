import { useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon.tsx";
import { useControl } from "./control.tsx";

// MessageInput (kit_RU.md §3.2), the old ui/Composer.tsx renamed: a 44+ textbox
// named by a <label> («реплика», kept for the screen reader, not drawn) and a
// send button named by its aria-label. Enter sends; the focus stays in the
// field after a send. An empty field draws the send as an outline, not filled
// (Н7) and is not `disabled`: a press then does nothing. Unavailable: both
// aria-disabled, the reason in words, tied by aria-describedby; pending:
// aria-busy on the field.
type Props = {
  label: string;
  placeholder?: string;
  sendLabel: string;
  onSend: (text: string) => void;
  maxLength?: number;
  disabled?: boolean;
  reason?: string;
  busy?: boolean;
};

export function MessageInput({ label, placeholder, sendLabel, onSend, maxLength, disabled, reason, busy }: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const c = useControl({ disabled, reason, busy });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
    field.current?.focus();
  };
  return (
    <div className="ui-field">
      <form className="ui-composer ui-message" onSubmit={submit}>
        <label htmlFor={c.ids.input} className="visually-hidden">{label}</label>
        <input {...c.attrs} ref={field} readOnly={c.readOnly} placeholder={placeholder} value={text} maxLength={maxLength} autoComplete="off" onChange={(event) => setText(event.target.value)} />
        <button type="submit" className={text.trim() ? "ui-send ui-send-on" : "ui-send"} aria-label={sendLabel} aria-disabled={c.attrs["aria-disabled"]}>
          <Icon name="send" />
        </button>
      </form>
      {c.notes}
    </div>
  );
}
