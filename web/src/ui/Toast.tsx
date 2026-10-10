import { useEffect, useRef, useState } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";

// Toast (kit_RU.md §3.3): a role=status that is in the page before it has a
// word, so the word is announced when it comes. It never takes the focus. Esc
// and «закрыть» close it. With `autoCloseMs` it leaves by itself, but not while
// the focus or the pointer is on it, and the count starts again when they go.
export function Toast({ text, onClose, autoCloseMs, ...rest }:
  { text: string | null; onClose: () => void; autoCloseMs?: number } & { [data: `data-${string}`]: string | undefined }) {
  const [held, setHeld] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!text) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [text]);
  useEffect(() => {
    if (!text || !autoCloseMs || held) return;
    const timer = setTimeout(() => close.current(), autoCloseMs);
    return () => clearTimeout(timer);
  }, [text, autoCloseMs, held]);
  return (
    <div {...rest} role="status" className="ui-toast-slot"
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)} onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
      {text ? (
        <div className="ui-toast">
          <span className="ui-toast-text">{text}</span>
          <Button type="button" kind="text" onClick={onClose}>{say("common.close")}</Button>
        </div>
      ) : null}
    </div>
  );
}
