import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { readPaperText } from "../../../depth/core/paper.ts";
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
export const CODE_GROUP = 4;
export const CODE_GROUPS = 4;

type Props = ControlState & { label?: string; groups?: readonly number[]; value: readonly string[]; onChange: (value: string[]) => void };

const clean = (raw: string) => readPaperText(raw).replace(/[^0-9A-Z]/g, "");

export function CodeField({ label = say("web.ui.codeName"), groups = [1, 2, 3, 4], value, onChange, hint, error, disabled, reason, busy }: Props) {
  const c = useControl({ hint, error, disabled, reason, busy });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = (index: number) => inputs.current[index]?.focus();

  const write = (index: number, raw: string) => {
    if (disabled) return;
    const text = clean(raw);
    const next = [...value];
    if (text.length <= CODE_GROUP) {
      next[index] = text;
      onChange(next);
      if (text.length === CODE_GROUP && index < groups.length - 1) focusAt(index + 1);
      return;
    }
    // More than one group's worth: a paste. A whole code goes to the shown
    // groups by their place on the paper; anything else fills on from here.
    let last = index;
    if (text.length === CODE_GROUP * CODE_GROUPS) {
      groups.forEach((place, i) => { next[i] = text.slice((place - 1) * CODE_GROUP, place * CODE_GROUP); });
      last = groups.length - 1;
    } else {
      for (let i = index; i < groups.length; i++) {
        const chunk = text.slice((i - index) * CODE_GROUP, (i - index + 1) * CODE_GROUP);
        if (!chunk) break;
        next[i] = chunk;
        last = i;
      }
    }
    onChange(next);
    focusAt(last);
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
