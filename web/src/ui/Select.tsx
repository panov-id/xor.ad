import type { KeyboardEvent } from "react";
import { type ControlState, useControl } from "./control.tsx";

// Select (kit_RU.md §3.2): the native select, named by its <label for>; arrows
// choose. In a language picker an <option> carries its own `lang` and its own
// name. Unavailable: aria-disabled, the select still takes focus but neither
// opens nor changes; the reason is in words, tied by aria-describedby.
export type SelectOption = { value: string; label: string; lang?: string };

export function Select({ label, options, value, onChange, hint, error, disabled, reason, busy, testid }:
  ControlState & { testid?: string; label: string; options: readonly SelectOption[]; value: string; onChange: (value: string) => void }) {
  const c = useControl({ hint, error, disabled, reason, busy });
  const locked = (event: KeyboardEvent<HTMLSelectElement>) => { if (disabled && event.key !== "Tab") event.preventDefault(); };
  return (
    <div className="ui-field">
      <label htmlFor={c.ids.input}>{label}</label>
      <select {...c.attrs} className="ui-input" data-testid={testid} value={value} onMouseDown={(event) => { if (disabled) event.preventDefault(); }} onKeyDown={locked}
        onChange={(event) => { if (!disabled) onChange(event.target.value); }}>
        {options.map((option) => <option key={option.value} value={option.value} lang={option.lang}>{option.label}</option>)}
      </select>
      {c.notes}
    </div>
  );
}
