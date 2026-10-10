import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { type ControlState, useControl } from "./control.tsx";

// Checkbox (kit_RU.md §3.2): the native checkbox inside its own <label>, so the
// words (links in them are Link) and the 24 square are one 44 target; Space
// toggles. The second channel is ✓ drawn in the box (it stays in mono). An
// error is aria-invalid + the word «ошибка:»; unavailable keeps focus and
// ignores the toggle, the reason beside it.
export function Checkbox({ children, checked, onChange, error, disabled, reason, busy, hint, ...rest }:
  ControlState & { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void } & { [data: `data-${string}`]: string | undefined }) {
  const c = useControl({ hint, error, disabled, reason, busy });
  return (
    <div className="ui-field">
      <label className="ui-check">
        <span className="ui-check-box">
          <input {...rest} {...c.attrs} type="checkbox" checked={checked} onClick={(event) => { if (disabled) event.preventDefault(); }}
            onChange={(event) => { if (!disabled) onChange(event.target.checked); }} />
          <Icon name="check" className="ui-glyph ui-check-mark" />
        </span>
        <span>{children}</span>
      </label>
      {c.notes}
    </div>
  );
}
