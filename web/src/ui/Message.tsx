import type { ReactNode } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";

type Data = { [data: `data-${string}`]: string | number | undefined };

// MessageLog and Message (kit_RU.md §3.3): the lines of a talk. The log is a
// `role=log` with `aria-live=polite`, named by the caller (the peer's name), so
// a new line is read once, without taking the focus. A line is told for the
// ear by who said it — «вы», the peer's name or «система» — before the text,
// and by its time after; the side it stands on is the second channel. A line
// that did not arrive says «не доставлено» in words and offers «ещё раз» (44).
// `extra` is a like that came later: a card in the middle, with its mark.
export function MessageLog({ label, children, ...rest }: { label: string; children: ReactNode } & Data) {
  return (
    <div role="log" aria-live="polite" aria-label={label} className="ui-log">
      <ul {...rest} className="ui-lines">{children}</ul>
    </div>
  );
}

export type MessageSide = "mine" | "theirs" | "system" | "extra";

export function Message({ side, who, text, time, failed, onAgain, mark, ...rest }:
  { side: MessageSide; who?: string; text: string; time?: string; failed?: boolean; onAgain?: () => void; mark?: string } & Data) {
  const speaker = side === "mine" ? say("web.ui.you") : side === "system" ? say("web.ui.system") : who;
  return (
    <li {...rest} className={`ui-msg ui-msg-${side}`}>
      {mark ? <span className="ui-msg-mark">{mark}</span> : null}
      {speaker ? <span className="visually-hidden">{speaker}: </span> : null}
      {side === "extra" ? <q>{text}</q> : <span className="ui-msg-text">{text}</span>}
      {time ? <span className="ui-msg-time">{time}</span> : null}
      {failed ? (
        <span className="ui-msg-failed">
          <span>{say("web.chat.not_delivered").replace(/^[\s·]+/, "")}</span>
          {onAgain ? <Button type="button" kind="text" onClick={onAgain} data-testid="send-again">{say("web.chat.send_again")}</Button> : null}
        </span>
      ) : null}
    </li>
  );
}

// Tombstone: what stands where a talk was. One `role=status`, announced once.
export function Tombstone({ title, text, ...rest }: { title: string; text: string } & Data) {
  return (
    <section {...rest} role="status" className="ui-tombstone">
      <h2 className="ui-tombstone-title">{title}</h2>
      <p className="ui-tombstone-text">{text}</p>
    </section>
  );
}

// Starters: the phrases a talk began from, by their place, each with who liked
// it from this reader's side (the caller words the mark). A removed phrase says so.
export type Starter = { position: number; mark: string; text?: string; removed?: string; likedBy: string };

export function Starters({ title, items, ...rest }: { title: string; items: readonly Starter[] } & Data) {
  return (
    <section {...rest} className="ui-starters" aria-labelledby="ui-starters-title">
      <h2 id="ui-starters-title" className="ui-starters-title">{title}</h2>
      <ol className="ui-starters-list">
        {items.map((item) => (
          <li key={item.position} data-testid="starter" data-position={item.position} data-liked-by={item.likedBy}>
            <span className="ui-msg-mark">{item.position}. {item.mark}</span>
            {item.removed ? <span className="ui-hint" data-testid="starter-removed">{item.removed}</span> : <q>{item.text}</q>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// UndoRow: «отклонено · вернуть». The mark is a word in a `role=status` that
// stands in the page with the row; «вернуть» is a Button text of 44. There is
// no timer: the row stays until the person leaves the screen.
export function UndoRow({ mark, action }: { mark: string; action: { label: string; onSelect: () => void; disabled?: boolean; testid?: string } }) {
  return (
    <div className="ui-undo">
      <span role="status" className="ui-undo-mark">{mark}</span>
      <Button type="button" kind="text" disabled={action.disabled} onClick={action.onSelect} data-testid={action.testid}>{action.label}</Button>
    </div>
  );
}
