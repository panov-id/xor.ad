import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

// SettingRow (kit_RU.md §3.3): a button of one line — the label and the value
// it holds now; the name is both, as read. `danger` is a verb of no return in
// --err; the word is the channel, the colour only the second one. Enter and
// Space follow from the native button.
export function SettingRow({ label, value, danger = false, onSelect, ...rest }:
  { label: string; value?: ReactNode; danger?: boolean; onSelect: () => void } & { [data: `data-${string}`]: string | undefined }) {
  return (
    <button {...rest} type="button" className={danger ? "ui-setting ui-setting-danger" : "ui-setting"} onClick={onSelect}>
      <span className="ui-setting-label">{label}</span>
      {value ? <span className="ui-setting-value">{value}</span> : null}
      <Icon name="chevron" className="ui-glyph ui-setting-chevron" />
    </button>
  );
}
