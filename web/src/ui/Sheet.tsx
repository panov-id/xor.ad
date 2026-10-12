import { useEffect, useId, useRef, type ReactNode } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";
import { Actions } from "./Links.tsx";

// ActionSheet and Confirm (kit_RU.md §3.1): the modal pair. On opening the focus
// goes to the h2 (tabindex=-1), not to a button, so the title is read first and
// nothing is pressed by a stray Enter; Tab is shut inside; Esc closes; on closing
// the focus returns to what had it when the dialog opened.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useModal(open: boolean, onClose: () => void) {
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    title.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !root.current) return;
      const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      const active = document.activeElement;
      const outside = !root.current.contains(active);
      if (event.shiftKey && (active === first || active === title.current || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); opener?.focus(); };
  }, [open]);
  return { root, title };
}

export type SheetAction = { id: string; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; testid?: string };

// ActionSheet: a titled list of actions of 44 each; the quiet ones first, the
// loud one (danger) last and in words. «закрыть» is the quietest, first.
// `children` stand between «закрыть» and the list: a setting chosen in place
// (the chat's span), which does not close the sheet.
export function ActionSheet({ open, title, actions, onClose, children, ...rest }:
  { open: boolean; title: string; actions: SheetAction[]; onClose: () => void; children?: ReactNode } & { [data: `data-${string}`]: string | undefined }) {
  const id = useId();
  const modal = useModal(open, onClose);
  if (!open) return null;
  // Two groups (strict review 11.10): the everyday actions, and below them, set apart, the dangerous ones in red.
  const calm = actions.filter((a) => !a.danger);
  const loud = actions.filter((a) => a.danger);
  const row = (a: SheetAction) => (
    <li key={a.id}>
      <Button type="button" kind={a.danger ? "danger" : "secondary"} disabled={a.disabled} data-testid={a.testid} onClick={() => { a.onSelect(); onClose(); }}>{a.label}</Button>
    </li>
  );
  return (
    <div className="ui-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div {...rest} ref={modal.root} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} className="ui-sheet">
        <h2 id={`${id}-t`} ref={modal.title} tabIndex={-1} className="ui-sheet-title">{title}</h2>
        <Button type="button" kind="text" onClick={onClose}>{say("common.close")}</Button>
        {children}
        {calm.length > 0 && <ul className="ui-sheet-actions" role="list">{calm.map(row)}</ul>}
        {loud.length > 0 && <ul className="ui-sheet-actions ui-sheet-danger" role="list" data-group="danger">{loud.map(row)}</ul>}
      </div>
    </div>
  );
}

// Confirm: an alertdialog. The h2 says what goes; `consequences` lists what
// disappears and what it costs, in numbers where there are numbers. No button
// is the default: Enter does nothing until one is focused. The scrim does not close it.
export function Confirm({ open, title, consequences, confirmLabel, cancelLabel, onConfirm, onClose, confirmTestId, cancelTestId, ...rest }:
  { open: boolean; title: string; consequences: ReactNode[]; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onClose: () => void;
    confirmTestId?: string; cancelTestId?: string }
  & { [data: `data-${string}`]: string | undefined }) {
  const id = useId();
  const modal = useModal(open, onClose);
  if (!open) return null;
  return (
    <div className="ui-scrim">
      <div {...rest} ref={modal.root} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className="ui-sheet ui-confirm">
        <h2 id={`${id}-t`} ref={modal.title} tabIndex={-1} className="ui-sheet-title">{title}</h2>
        <ul id={`${id}-d`} className="ui-confirm-list" role="list">
          {consequences.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
        <Actions>
          <Button type="button" kind="secondary" onClick={onClose} data-testid={cancelTestId}>{cancelLabel}</Button>
          <Button type="button" kind="danger" onClick={() => { onConfirm(); onClose(); }} data-testid={confirmTestId}>{confirmLabel}</Button>
        </Actions>
      </div>
    </div>
  );
}
