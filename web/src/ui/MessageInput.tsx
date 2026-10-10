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
// Alone, it keeps its text and clears it after a send. A screen that must keep
// the text until the node has taken it (a chat) passes `value` and `onChange`
// and clears it itself.
type Props = {
  label: string;
  placeholder?: string;
  sendLabel: string;
  onSend: (text: string) => void;
  maxLength?: number;
  disabled?: boolean;
  reason?: string;
  busy?: boolean;
  value?: string;
  onChange?: (text: string) => void;
  inputTestId?: string;
  sendTestId?: string;
};

export function MessageInput({ label, placeholder, sendLabel, onSend, maxLength, disabled, reason, busy, value, onChange, inputTestId, sendTestId }: Props) {
  const [own, setOwn] = useState("");
  const controlled = value !== undefined;
  const text = controlled ? value : own;
  const field = useRef<HTMLInputElement>(null);
  const c = useControl({ disabled, reason, busy });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const line = text.trim();
    if (!line || disabled) return;
    onSend(line);
    if (!controlled) setOwn("");
    field.current?.focus();
  };
  return (
    <div className="ui-field">
      <form className="ui-composer ui-message" onSubmit={submit}>
        <label htmlFor={c.ids.input} className="visually-hidden">{label}</label>
        <input {...c.attrs} ref={field} readOnly={c.readOnly} placeholder={placeholder} value={text} maxLength={maxLength} autoComplete="off" data-testid={inputTestId}
          onChange={(event) => (controlled ? onChange?.(event.target.value) : setOwn(event.target.value))} />
        <button type="submit" className={text.trim() ? "ui-send ui-send-on" : "ui-send"} aria-label={sendLabel} aria-disabled={c.attrs["aria-disabled"]} data-testid={sendTestId}>
          <Icon name="send" />
        </button>
      </form>
      {c.notes}
    </div>
  );
}
