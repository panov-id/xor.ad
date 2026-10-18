// The conversation (sosed Dusk: w3_chat; over: w3_chat-over). The session is the platform's
// (depth/web-platform/chat/chat_state.ts, the web's useChat holds the same): keys at each turn, the room, one's own
// span and silence, the resend schedule. This file only draws it: ChatPane takes a view and the actions, so the
// stand draws it from a view of its own (stand.tsx) and the measure reads the sheet's geometry off it.
// The web's testids: lines, mine, theirs, system, extra-like, send-again, text, send, chat-more, tombstone,
// show-safety, error, status; new ones: chat-back, chat-ring, starter-chip, quick-<sticker>, quick-game.
//
// The «…» sheet is chat-menu.tsx (w3_chat-more): its own history entry, so the system Back closes it.
// Not here yet: the game (w3_chat-game), the rekey prompts, the starters' list.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Client } from "@sdk/client.ts";
import { stickerOf, stickerText } from "@sdk/sticker.ts";
import { ChatSession, type ChatView } from "@platform/chat/chat_state.ts";
import type { ChatKeys, InboxChatRow } from "@platform/chat/keys.ts";
import { failedLine, LANG, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { chevronLeft, ellipsis, lock, send as sendIcon, shield } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { bubblesOf, clockOf, headerLine, QUICK_STICKERS, ringOf } from "./chat-logic";
import { ChatMenu } from "./chat-menu";

export interface ChatActions {
  onBack: () => void;
  onSend: (line: string) => Promise<boolean>;
  onResend: (localId: string) => void;
  onMore: () => void;
  onSafety: () => void;
  onGame: () => void;
}

const initialOf = (name: string): string => [...name.trim()][0]?.toLocaleUpperCase(LANG) ?? "";

export function ChatPane({ view, now, actions }: { view: ChatView; now: number; actions: ChatActions }) {
  const [text, setText] = useState("");
  const { row, over } = view;
  const line = headerLine(view, now);
  const ring = ringOf(view.endsAt, view.span, now);
  const starter = view.starters[0];

  async function send(given?: string) {
    const typed = given === undefined;
    const went = await actions.onSend(typed ? text.trim() : given);
    if (went && typed) setText("");
  }

  return (
    <Screen name="chat" title={row.name} className="ch" data-over={over ? "1" : undefined} data-keys={view.keysState} data-id={row.id}>
      <header className="ch-head">
        <button type="button" className="ch-back" aria-label={say("common.back")} onClick={actions.onBack} data-testid="chat-back"><Icon d={chevronLeft} /></button>
        <span className="ch-avatar" aria-hidden="true">{initialOf(row.name)}</span>
        <div className="ch-who">
          <h1>{`${row.name}, ${view.peerAge}`}</h1>
          <p className={over ? "ch-line ch-line-over" : "ch-line"}>{say(line.key, line.values)}</p>
        </div>
        <span className="ch-ring" role="img" aria-label={say("app.chat.ring", { m: ring.minutes })} data-testid="chat-ring" style={{ "--ch-ring-left": String(ring.left) } as React.CSSProperties}>
          <span>{ring.minutes}</span>
        </span>
        {!over && <button type="button" className="ch-more" aria-label={say("app.chat.more")} onClick={actions.onMore} data-testid="chat-more"><Icon d={ellipsis} /></button>}
      </header>
      <div className="ch-sheet">
        <ol className="ch-lines" data-testid="lines" aria-live="polite">
          {starter && !over && (
            <li className="ch-starter" data-testid="starter-chip">{say("app.chat.started_from", { text: starter.text })}</li>
          )}
          {bubblesOf(view.lines).map(({ line: l, side }) => {
            const sticker = stickerOf(l.text);
            const words = sticker ? say(`web.sticker.${sticker}`) : l.text;
            const testid = l.extra ? "extra-like" : l.system ? "system" : l.mine ? "mine" : "theirs";
            return (
              <li key={l.id} className={`ch-row ch-${side}`} data-state={l.state}>
                <p className={sticker ? "ch-bubble ch-sticker" : "ch-bubble"} data-testid={testid}>{words}</p>
                <span className="ch-time">{clockOf(l.at, LANG)}</span>
                {l.mine && l.state === "failed" && (
                  <button type="button" className="ch-again" onClick={() => actions.onResend(l.id)} data-testid="send-again">{say("web.chat.send_again")}</button>
                )}
              </li>
            );
          })}
        </ol>
        {!over && view.safety && <p className="ch-safety-line" data-testid="safety">{say("app.chat.safety_is", { code: view.safety })}</p>}
        {over ? (
          <section className="ch-over" data-testid="tombstone">
            <span className="ch-over-mark" aria-hidden="true"><Icon d={lock} /></span>
            <h2>{label(view.blocked ? "app.chat.blocked_title" : "app.chat.over_title")}</h2>
            <p>{say("app.chat.over_text")}</p>
            <button type="button" className="ch-safety" onClick={actions.onSafety} data-testid="show-safety"><Icon d={shield} /><span>{say("app.chat.safety")}</span></button>
            {view.safety && <p className="ch-safety-code" data-testid="safety">{view.safety}</p>}
          </section>
        ) : (
          <footer className="ch-foot">
            <div className="ch-quick">
              {QUICK_STICKERS.map((id) => (
                <button key={id} type="button" className={`ch-chip ch-chip-${id}`} onClick={() => void send(stickerText(id))} disabled={view.keysState !== "open"} data-testid={`quick-${id}`}>
                  {say(`app.chat.quick.${id}`)}
                </button>
              ))}
              <button type="button" className="ch-chip ch-chip-game" onClick={actions.onGame} data-testid="quick-game">{say("app.chat.quick.game")}</button>
            </div>
            <form className="ch-field" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <input
                className="ch-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={say("app.chat.placeholder")}
                aria-label={say("app.chat.placeholder")} disabled={view.keysState !== "open"} data-testid="text"
              />
              <button type="submit" className="ch-send" aria-label={say("app.chat.send")} disabled={view.keysState !== "open" || !text.trim()} data-testid="send"><Icon d={sendIcon} /></button>
            </form>
            {view.error && <p className="ch-error" role="alert" data-testid="error">{failedLine(new Error(view.error))}</p>}
          </footer>
        )}
      </div>
    </Screen>
  );
}

/** The conversation held for the screen's life: the session, its clock, and what the pane asks of it. */
export function Chat({ client, keys, row, onBack }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void }) {
  const [session] = useState(() => new ChatSession({ client, keys, row, say }));
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  const view = useSyncExternalStore((on) => session.subscribe(on), () => session.view());
  const now = useNow();
  useEffect(() => {
    if (view.endsAt <= now) session.silenceLapsed();
  }, [now, view.endsAt, session]);
  // The «…» sheet rides an entry of its own over the chat's (as the feed's open card does): the system Back closes it.
  const sheetOf = () => (history.state as { sheet?: string } | null)?.sheet === "menu";
  const [menu, setMenu] = useState(sheetOf);
  useEffect(() => {
    const onPop = () => setMenu(sheetOf());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const openMenu = () => { history.pushState({ ...(history.state as object), sheet: "menu" }, "", location.href); setMenu(true); };
  const closeMenu = () => { if (sheetOf()) history.back(); else setMenu(false); };
  const safety = () => session.setSafety(keys.safetyCodeOf(row.id) ?? say("web.chat.keys_not_open"));
  return (
    <>
      <ChatPane view={view} now={now} actions={{
        onBack,
        onSend: (line) => session.send(line),
        onResend: (id) => void session.resend(id),
        onMore: openMenu,
        onSafety: safety,
        onGame: () => session.setGameOpen(true),
      }} />
      {menu && !view.over && (
        <ChatMenu span={view.span} busy={view.busy} waitingForPeer={view.waitingForPeer} actions={{
          onClose: closeMenu,
          onSpan: (span) => void session.changeSpan(span),
          onGame: () => { session.setGameOpen(!view.gameOpen); closeMenu(); },
          onSafety: () => { safety(); closeMenu(); },
          onRekey: () => { void session.rekey(view.askedByPeer ? "agree" : "ask"); closeMenu(); },
          onEnd: () => { closeMenu(); void session.endChat(); },
          onBlock: () => { closeMenu(); void session.block(); },
        }} />
      )}
    </>
  );
}

/** Seconds, ticking once a second (the silence's clock and the header's minutes). */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  return now;
}
