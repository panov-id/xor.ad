import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

// SettingRow (kit_RU.md §3.3): a button of one line — the label and the value
// it holds now; the name is both, as read. `danger` is a verb of no return in
// --err; the word is the channel, the colour only the second one. Enter and
// Space follow from the native button. `icon` is a leading glyph (decoration,
// the label names the row). `disabled` is aria-disabled: the row keeps its
// place and focus and a press does nothing (kit §2: never `disabled`).
export function SettingRow({ label, value, danger = false, icon, disabled = false, onSelect, ...rest }:
  { label: string; value?: ReactNode; danger?: boolean; icon?: IconName; disabled?: boolean; onSelect: () => void } & { [data: `data-${string}`]: string | undefined }) {
  return (
    <button {...rest} type="button" className={danger ? "ui-setting ui-setting-danger" : "ui-setting"} aria-disabled={disabled ? true : undefined}
      onClick={() => { if (!disabled) onSelect(); }}>
      {icon ? <Icon name={icon} className="ui-glyph ui-setting-icon" /> : null}
      <span className="ui-setting-label">{label}</span>
      {value ? <span className="ui-setting-value">{value}</span> : null}
      <Icon name="chevron" className="ui-glyph ui-setting-chevron" />
    </button>
  );
}
