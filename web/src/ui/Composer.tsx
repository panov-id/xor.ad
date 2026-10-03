import { useState, type FormEvent } from "react";
import { Icon } from "./Icon.tsx";

// The kit's floating composer (components.svg composer-float): a 52-high fg
// pill with the shadow +3,+3, on-fg-muted placeholder, and the accent send
// circle in a 44 zone. The send is filled only while there is text (Н7).
type Props = { placeholder: string; label: string; sendLabel: string; onSend: (text: string) => void; maxLength?: number };

export function Composer({ placeholder, label, sendLabel, onSend, maxLength }: Props) {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };
  return (
    <form className="ui-composer" onSubmit={submit}>
      <input aria-label={label} placeholder={placeholder} value={text} maxLength={maxLength} onChange={(event) => setText(event.target.value)} />
      <button type="submit" className={text.trim() ? "ui-send ui-send-on" : "ui-send"} aria-label={sendLabel}>
        <Icon name="send" />
      </button>
    </form>
  );
}
