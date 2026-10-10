import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { ErrorLine } from "./ErrorLine.tsx";

// Segments and Choice (kit_RU.md §3.2): a `radiogroup` named by its label,
// `radio` buttons with aria-checked, Tab enters once (on the chosen one, the
// rest are tabindex -1), arrows move the choice and the focus. The second
// channel is not colour: Segments fills the chosen and thickens its rim,
// Choice adds ✓ and thickens the rim, with an optional sample (a theme's
// swatch) next to the word. An option may carry its own `lang` (a language
// named in itself). Unavailable: aria-disabled, focus stays, the choice is kept.
export type ChoiceOption = { value: string; label: string; lang?: string; sample?: ReactNode };

type Props = {
  label: string;
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  reason?: string;
  error?: string;
};

function Radios({ kind, label, options, value, onChange, disabled, reason, error }: Props & { kind: "segments" | "choice" }) {
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = `${uid}-l`;
  const reasonId = `${uid}-r`;
  const errorId = `${uid}-e`;
  const chosen = options.findIndex((option) => option.value === value);
  const entry = chosen >= 0 ? chosen : 0;
  const pick = (index: number) => {
    if (disabled) return;
    onChange(options[index].value);
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const index = (entry + move + options.length) % options.length;
    refs.current[index]?.focus();
    pick(index);
  };
  const described = [disabled && reason ? reasonId : "", error ? errorId : ""].filter(Boolean).join(" ");
  return (
    <div className="ui-field">
      <span id={labelId} className="ui-label">{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={described || undefined} aria-disabled={disabled ? true : undefined}
        aria-invalid={error ? true : undefined} aria-errormessage={error ? errorId : undefined}
        className={kind === "segments" ? "ui-segments" : "ui-choice"} onKeyDown={keys}>
        {options.map((option, index) => {
          const on = index === chosen;
          return (
            <button key={option.value} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" aria-checked={on} lang={option.lang}
              tabIndex={index === entry ? 0 : -1} className={on ? "ui-seg ui-seg-on" : "ui-seg"} onClick={() => pick(index)}>
              {option.sample}
              <span>{option.label}</span>
              {kind === "choice" && on ? <Icon name="check" className="ui-glyph ui-seg-mark" /> : null}
            </button>
          );
        })}
      </div>
      {disabled && reason ? <p id={reasonId} className="ui-reason">{reason}</p> : null}
      {error ? <ErrorLine id={errorId}>{error}</ErrorLine> : null}
    </div>
  );
}

export function Segments(props: Props) {
  return <Radios {...props} kind="segments" />;
}

export function Choice(props: Props) {
  return <Radios {...props} kind="choice" />;
}
