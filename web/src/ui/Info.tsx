import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

// «ⓘ» (owner 2026-10-01): where a screen has a lot of explaining, an
// icon-only button opens the same words in a comic balloon. The balloon is a
// non-modal dialog: focus moves into it, Esc and a press outside close it,
// and focus comes back to the button. `label` is the button's name — an
// existing key where one fits, else say("web.info"). `warn` is the red
// one of the mocks (an irreversible consequence).
// The balloon keeps the words in the DOM only while open; the words are the
// screen's own keys, moved, not new ones.
export function Info({ label, children, warn = false, ...rest }: { label: string; children: ReactNode; warn?: boolean; [data: `data-${string}`]: string | undefined }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const balloon = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    balloon.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(true); } };
    const press = (e: PointerEvent) => {
      const t = e.target as Node;
      if (balloon.current?.contains(t) || button.current?.contains(t)) return;
      // The press's own mousedown moves focus to where it landed after this
      // handler; give it back once that has happened.
      setOpen(false);
      setTimeout(() => button.current?.focus(), 0);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", press);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", press); };
  }, [open]);
  return (
    <span className="ui-info" {...rest}>
      <button ref={button} type="button" className={warn ? "ui-button ui-info-warn ui-icon-only" : "ui-button ui-info-plain ui-icon-only"} aria-label={label} aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => (open ? close(true) : setOpen(true))}>
        <Icon name="info" />
      </button>
      {open ? (
        <div ref={balloon} id={id} role="dialog" aria-label={label} tabIndex={-1} className={warn ? "ui-balloon ui-balloon-warn" : "ui-balloon"}>
          {children}
        </div>
      ) : null}
    </span>
  );
}
