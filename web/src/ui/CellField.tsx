import type { InputHTMLAttributes } from "react";
import { type ControlState, useControl } from "./control.tsx";
import "./CellField.css";

// CellField (kit_RU.md §9.2 «поле кода»): a short code typed into one <input>,
// drawn as a cell per character. The input stays the field — its name is the
// <label for>, typing, paste and the value are the browser's own, what was
// typed is kept as typed — and the cells under it only show the characters
// read out of it (letters and digits, upper case), aria-hidden. Without a
// brand's rules the cells are not shown and this is a Field (styles.css
// .ui-input); neighbro draws the cells (brands/neighbro/stickers.css).
type Native = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "value" | "onChange" | "disabled" | "readOnly">;

const shown = (raw: string, cells: number) => raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, cells);

export function CellField({ label, cells, value, onChange, hint, error, disabled, reason, busy, ...rest }:
  Native & ControlState & { label: string; cells: number; value: string; onChange: (value: string) => void }) {
  const c = useControl({ hint, error, disabled, reason, busy });
  const chars = shown(value, cells);
  return (
    <div className="ui-field ui-cellfield">
      <label htmlFor={c.ids.input}>{label}</label>
      <div className="ui-cells-box">
        <div className="ui-cells" aria-hidden="true">
          {Array.from({ length: cells }, (_, i) => (
            <span key={i} className={i === chars.length ? "ui-cell ui-cell-next" : "ui-cell"}>{chars[i] ?? ""}</span>
          ))}
        </div>
        <input {...rest} {...c.attrs} readOnly={c.readOnly} className="ui-input" type="text" autoCapitalize="characters"
          spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
      {c.notes}
    </div>
  );
}
