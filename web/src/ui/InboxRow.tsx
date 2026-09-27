// The kit's conversation row (components.svg row-chat): 72 on a 72 pitch at
// --r-1, text at x 12 — name 16/600, the last line 14 in fg, time in mono;
// «ждёт вашего ответа» in accent-text on the right and the dot when it is my
// turn; the chosen row sits on panel-2.
type Props = { name: string; line: string; time: string; wait?: string; dot?: boolean; selected?: boolean; onOpen: () => void };

export function InboxRow({ name, line, time, wait, dot, selected, onOpen }: Props) {
  return (
    <button type="button" className={selected ? "ui-inbox-row ui-inbox-row-on" : "ui-inbox-row"} onClick={onOpen} aria-current={selected ? "true" : undefined}>
      <span className="ui-inbox-name">{name}</span>
      <span className="ui-inbox-line">{line}</span>
      <span className="ui-inbox-foot">
        <span className="ui-inbox-time">{time}</span>
        {wait ? <span className="ui-inbox-wait">{wait}</span> : null}
      </span>
      {dot ? <span className="ui-dot" aria-hidden="true" /> : null}
    </button>
  );
}
