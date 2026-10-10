import { useId } from "react";
import { say } from "../locales/say.ts";
import { Dot } from "./Dot.tsx";

// The kit's conversation row (components.svg row-chat): 72 on a 72 pitch at
// --r-1, text at x 12 — name 16/600, the last line 14 in fg, time in mono;
// «ждёт вашего ответа» in accent-text on the right and the dot when it is my
// turn; the chosen row sits on panel-2. The dot is mute (Dot), so a new row
// says «новое» in its name. `time` is left out when the row has none to tell.
// The name of the button is the person and «новое» only; the line, the time and
// «ждёт вас» are its description (aria-describedby), so a reader does not hear
// a whole paragraph as a name (walkthrough 10.10.2026, open-chat).
type Props = { name: string; line: string; time?: string; wait?: string; dot?: boolean; selected?: boolean; onOpen: () => void } & { [data: `data-${string}`]: string | undefined };

export function InboxRow({ name, line, time, wait, dot, selected, onOpen, ...rest }: Props) {
  const id = useId();
  return (
    <button {...rest} type="button" className={selected ? "ui-inbox-row ui-inbox-row-on" : "ui-inbox-row"} onClick={onOpen} aria-current={selected ? "true" : undefined}
      aria-labelledby={`${id}-name`} aria-describedby={`${id}-line ${id}-foot`}>
      <span id={`${id}-name`} className="ui-inbox-name">{name}{dot ? <span className="visually-hidden"> {say("web.ui.new")}</span> : null}</span>
      <span id={`${id}-line`} className="ui-inbox-line">{line}</span>
      <span id={`${id}-foot`} className="ui-inbox-foot">
        <span className="ui-inbox-time">{time}</span>
        {wait ? <span className="ui-inbox-wait">{wait}</span> : null}
      </span>
      {dot ? <Dot /> : null}
    </button>
  );
}
