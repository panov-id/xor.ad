import type { ReactNode } from "react";
import { say } from "../locales/say.ts";

// ErrorLine (kit_RU.md §3.3): «ошибка:» first, in words, then the cause in the
// interface's language. role=alert: one error is one announcement. The colour
// is --err, the second channel is the word. It replaces the temporary ErrorText.
export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} role="alert" className="ui-error">{say("web.ui.error")} {children}</p>;
}

// After a failed send the focus goes to the first field with an error.
export function focusFirstInvalid(root: ParentNode): boolean {
  const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  field?.focus();
  return field !== null;
}
