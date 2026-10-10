import { say } from "../locales/say.ts";

// Status header (kit_RU.md §3.3): the connection's outcome as a word —
// «на связи», «соединяемся», «нет сети», «у нас не получилось». The first three
// live in one role=status that is in the page before it has words; a failure
// is announced once, by a role=alert mounted when it comes. The glyph is
// decoration; the word is the channel.
export type StatusState = "on" | "connecting" | "offline" | "failed";

const WORD: Record<StatusState, string> = {
  on: "web.chat.connected",
  connecting: "web.ui.statusConnecting",
  offline: "web.ui.statusOffline",
  failed: "web.ui.statusFailed",
};
const GLYPH: Record<StatusState, string> = { on: "●", connecting: "◐", offline: "○", failed: "✕" };

// Status `inline` (kit_RU.md §3.3): one word in a `role=status` that stands in
// the page before it has words, so a change is announced. Nothing else.
export function StatusInline({ children, ...rest }: { children: string; [data: `data-${string}`]: string | undefined }) {
  return <p {...rest} role="status" className="ui-status-line">{children}</p>;
}

export function StatusHeader({ state, ...rest }: { state: StatusState; [data: `data-${string}`]: string | undefined }) {
  const failed = state === "failed";
  const line = (
    <>
      <span aria-hidden="true" className="ui-status-glyph">{GLYPH[state]}</span> {say(WORD[state])}
    </>
  );
  return (
    <div {...rest} className="ui-status" data-state={state}>
      <p role="status" className="ui-status-line">{failed ? null : line}</p>
      {failed ? <p role="alert" className="ui-status-line">{line}</p> : null}
    </div>
  );
}
