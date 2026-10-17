import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { CODE_GROUP, CODE_GROUPS, layOutGroups } from "../../../depth/core/register.ts";
import { say } from "../locales/say.ts";
import { type ControlState, useControl } from "./control.tsx";

// CodeField (kit_RU.md §3.2): the paper code is four groups of four. The name
// is a `group` called «бумажный код»; each group is a textbox called «группа N
// из M» (N is its place on the paper, not among the shown). `groups` picks the
// shown ones: [2, 4] asks only for the second and the fourth, as Register and
// Reissue do. Case and separators are read inside (depth/core/paper.ts
// readPaperText, the same reading the terminal uses). A whole code pasted into
// any group is laid out over all of them; Backspace in an empty group goes back;
// the fourth character moves on to the next group.
export { CODE_GROUP, CODE_GROUPS };

type Props = ControlState & { label?: string; groups?: readonly number[]; value: readonly string[]; onChange: (value: string[]) => void };

export function CodeField({ label = say("web.ui.codeName"), groups = [1, 2, 3, 4], value, onChange, hint, error, disabled, reason, busy }: Props) {
  const c = useControl({ hint, error, disabled, reason, busy });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = (index: number) => inputs.current[index]?.focus();

  // The laying out of typed and pasted text is the core's (register.ts layOutGroups), one for both faces.
  const write = (index: number, raw: string) => {
    if (disabled) return;
    const { next, focus } = layOutGroups(value, index, raw, groups);
    onChange(next);
    if (focus !== null) focusAt(focus);
  };
  const paste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    write(index, event.clipboardData.getData("text"));
  };
  const keys = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && (value[index] ?? "") === "" && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
    }
  };
  return (
    <div className="ui-field" role="group" aria-labelledby={c.ids.input}>
      <span id={c.ids.input} className="ui-label">{label}</span>
      <div className="ui-code-row">
        {groups.map((place, i) => (
          <input key={place} ref={(node) => { inputs.current[i] = node; }} className="ui-input ui-code-input" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            aria-label={say("web.ui.codeGroup", { n: place, m: CODE_GROUPS })}
            aria-describedby={c.attrs["aria-describedby"]} aria-invalid={c.attrs["aria-invalid"]} aria-errormessage={c.attrs["aria-errormessage"]}
            aria-disabled={c.attrs["aria-disabled"]} aria-busy={c.attrs["aria-busy"]} readOnly={c.readOnly}
            value={value[i] ?? ""} onChange={(event) => write(i, event.target.value)} onPaste={(event) => paste(i, event)} onKeyDown={(event) => keys(i, event)} />
        ))}
      </div>
      {c.notes}
    </div>
  );
}
