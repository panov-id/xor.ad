// The conversation (sosed Dusk: w3_chat; over: w3_chat-over). The session is the platform's
// (depth/web-platform/chat/chat_state.ts, the web's useChat holds the same): keys at each turn, the room, one's own
// span and silence, the resend schedule. This file only draws it: ChatPane takes a view and the actions, so the
// stand draws it from a view of its own (stand.tsx) and the measure reads the sheet's geometry off it.
// The web's testids: lines, mine, theirs, system, extra-like, send-again, text, send, chat-more, tombstone,
// show-safety, error, status; new ones: chat-back, chat-ring, starter-chip, quick-<sticker>, quick-game.
//
// The «…» sheet is chat-menu.tsx (w3_chat-more): its own history entry, so the system Back closes it.
// The game (chat-game, chat-game-offer, chat-game-board) is chat-game.tsx: its screens open over the conversation, drawn
// into the frame's overlay (OverlayCtx), a proposal is a card under the lines. The safety code (chat-safety) is a screen
// of its own over the conversation too; its back returns here.
// Not here yet: the starters' list.
import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Client } from "@sdk/client.ts";
import { stickerOf, stickerText } from "@sdk/sticker.ts";
import { ChatSession, type ChatView } from "@platform/chat/chat_state.ts";
import type { ChatKeys, InboxChatRow } from "@platform/chat/keys.ts";
import { failedLine, LANG, label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { useSkeleton } from "../shell/loading";
import { Screen } from "../shell/Screen";
import { bubblesOf, clockOf, headerLine, popStep, ringOf } from "./chat-logic";
import { ChatGame } from "./chat-game";
import { ChatMenu, OverlayCtx } from "./chat-menu";

export interface ChatActions {
  onBack: () => void;
  onSend: (line: string) => Promise<boolean>;
  onResend: (localId: string) => void;
  onMore: () => void;
  onSafety: () => void;
  onGame: () => void;
  /** The keys' reissue, asked or agreed (the stand's chat has none). */
  onRekey?: () => void;
  /** Back from the safety code's screen (the stand's chat has none). */
  onSafetyBack?: () => void;
}

/** chat-safety: the shield, the code in tiles (the node's code is five groups of four digits), and what it is for. The
 * web's testids: safety (holding the code in a <code>), new: safety-back. */
function SafetyScreen({ code, onBack }: { code: string; onBack?: () => void }) {
  const groups = /^\d{4}( \d{4})*$/.test(code) ? code.split(" ") : null;
  return (
    <div className="k-col k-ch-full" data-screen="chat-safety">
      <header className="k-row k-bar">
        <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={onBack} data-testid="safety-back"><NdIcon name="back" /></button>
        <h1 className="k-bar-title">{label("app.chat.safety")}</h1>
      </header>
      <section className="k-panel k-grow k-sf">
        <div className="k-sf-shield" aria-hidden="true"><NdIcon name="shield" /></div>
        <div data-testid="safety">
          {groups ? (
            <code className="k-sf-grid">{groups.map((g, i) => <Fragment key={i}><span className="k-sf-tile">{g}</span>{" "}</Fragment>)}</code>
          ) : <code className="k-sf-text">{code}</code>}
        </div>
        <div className="k-note k-chm-note" role="status"><NdIcon name="eye" /><p>{say("app.chat.safety_note")}</p></div>
      </section>
    </div>
  );
}

// chat.html: the sticker strip (the prototype draws twelve; the SDK's set has these five that open a talk, and the game) and the icon each is drawn with
const STRIP: ReadonlyArray<{ id: string; icon: string }> = [{ id: "hi", icon: "wave" }, { id: "thanks", icon: "thanks" }, { id: "deal", icon: "deal" }, { id: "wow", icon: "wow" }, { id: "coffee", icon: "coffee" }];

/** `frame`: a screen of its own (the phone, /chat), or a pane beside the talks' list (the tablet and up: tablet_834_Talks), a
 * <section> inside the inbox's screen, without its own back. */
/** `menu`: the «…» sheet, drawn in the frame's overlay so a pane keeps it inside (desktop-1440 5-talks/chat-more.svg). */
export function ChatPane({ view, now, actions, game, menu, frame = "screen" }: { view: ChatView; now: number; actions: ChatActions; game?: ReactNode; menu?: ReactNode; frame?: "screen" | "pane" }) {
  const [text, setText] = useState("");
  const { row, over } = view;
  const line = headerLine(view, now);
  const ring = ringOf(view.endsAt, view.span, now);
  const starter = view.starters[0];
  // MOTION.md 02: the talk's first lines pop in one after another (--i = place in that first batch); a line that comes later pops at once.
  const firstBatch = useRef<number | null>(null);
  if (firstBatch.current === null && view.lines.length > 0) firstBatch.current = view.lines.length;
  // «typing» while the room opens, by the waiting rules (not under 300 ms, not under 600 ms once shown)
  const typing = useSkeleton(view.keysState === "opening" && !over);

  async function send(given?: string) {
    const typed = given === undefined;
    const went = await actions.onSend(typed ? text.trim() : given);
    if (went && typed) setText("");
  }

  const keysBlock = view.askedByPeer ? (
    <div className="k-tile k-ch-keys" data-testid="rekey-asked">
      <div className="k-row"><NdIcon name="keys" /><p>{say("web.chat.peer_asks")}</p></div>
      <button type="button" className="k-cta" disabled={view.busy} onClick={actions.onRekey} data-testid="rekey-agree"><NdIcon name="check" /><span>{say("web.chat.rekey_agree")}</span></button>
    </div>
  ) : view.waitingForPeer ? (
    <div className="k-tile k-ch-keys"><div className="k-row"><NdIcon name="keys" /><p data-testid="rekey-waiting">{say("web.chat.rekey_waiting")}</p></div></div>
  ) : view.keysState === "failed" ? (
    <div className="k-tile k-ch-keys" role="alert" data-testid="keys-failed">
      <div className="k-row"><NdIcon name="keys" /><p>{say("app.chat.keys_failed")}</p></div>
      <button type="button" className="k-cta" disabled={view.busy} onClick={actions.onRekey} data-testid="rekey-ask"><NdIcon name="refresh" /><span>{say("app.chat.new_keys")}</span></button>
    </div>
  ) : null;

  // the bar: back, the person's pill (face, name and what is left, the ring), «…»; `own` is the conversation's (its testids), the game's screen draws it again
  const bar = (onBack: () => void, backLabel: string, own: boolean): ReactNode => (
    <header className="k-row k-bar">
      <button type="button" className="k-bar-btn" aria-label={backLabel} onClick={onBack} data-testid={own ? "chat-back" : undefined}><NdIcon name="back" /></button>
      <div className="k-bar-title k-ch-who">
        <span className="k-ch-ava" aria-hidden="true"><NdIcon name="me" /></span>
        <div className="k-stack k-ch-name">
          <h1>{`${row.name}, ${view.peerAge}`}</h1>
          <p className={over ? "k-meta k-ch-line k-ch-line-over" : "k-meta k-ch-line"}>{say(line.key, line.values)}</p>
        </div>
        <svg className="k-tk-ring" width="40" height="40" role="img" aria-label={say("app.chat.ring", { m: ring.minutes })} data-testid={own ? "chat-ring" : undefined}>
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--tile-strong)" strokeWidth="5" />
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(1, Number(ring.left))) * 100.5).toFixed(1)} 100.5`} transform="rotate(-90 20 20)" />
        </svg>
      </div>
      {!over && <button type="button" className="k-bar-btn" aria-label={`${say("app.chat.more")}: ${row.name}`} onClick={actions.onMore} data-testid={own ? "chat-more" : undefined}><NdIcon name="more" /></button>}
    </header>
  );
  const [overEl, setOverEl] = useState<HTMLElement | null>(null);

  return (
    <OverlayCtx.Provider value={{ el: overEl, bar }}>
    <Frame frame={frame} title={row.name} over={over} keys={view.keysState} id={row.id}
      overlay={<div className="k-ch-over" ref={setOverEl}>{view.safety !== null && <SafetyScreen code={view.safety} onBack={actions.onSafetyBack} />}{menu}</div>}>
      {bar(actions.onBack, say("common.back"), true)}
      {over ? (
        <>
          <section className="k-panel k-grow k-tk-empty" data-testid="tombstone">
            <span className="k-tk-hero" data-tone="5" aria-hidden="true"><NdIcon name="fade" /></span>
            <h2>{label(view.blocked ? "app.chat.blocked_title" : "app.chat.over_title")}</h2>
            <p>{say("app.chat.over_text")}</p>
          </section>
          <section className="k-panel k-actions">
            <div className="k-row">
              <button type="button" className="k-tk-round" aria-label={say("app.chat.safety")} onClick={actions.onSafety} data-testid="show-safety"><NdIcon name="shield" /></button>
              <button type="button" className="k-cta" onClick={actions.onBack} data-testid="chat-to-talks"><NdIcon name="talks" /><span>{say("app.wait.to_talks")}</span></button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="k-body k-pad8 k-ch-lines" data-game={game ? "" : undefined}>
            <ol className="k-ch-list" data-testid="lines" aria-live="polite">
              {starter && (
                <li className="k-note k-ch-starter" data-testid="starter-chip"><NdIcon name="phrase" /><span>{say("app.chat.started_from", { text: starter.text })}</span></li>
              )}
              {bubblesOf(view.lines).map(({ line: l, side }, at) => {
                const sticker = stickerOf(l.text);
                const words = sticker ? say(`web.sticker.${sticker}`) : l.text;
                const testid = l.extra ? "extra-like" : l.system ? "system" : l.mine ? "mine" : "theirs";
                return (
                  <li key={l.id} className={`k-ch-row k-ch-${side}`} data-state={l.state} style={{ "--i": popStep(at, firstBatch.current) } as CSSProperties}>
                    <p className={sticker ? "k-ch-bubble k-ch-sticker" : "k-ch-bubble"} data-testid={testid}>{words}</p>
                    <span className="k-meta k-ch-time">{clockOf(l.at, LANG)}</span>
                    {l.mine && l.state === "failed" && (
                      <button type="button" className="k-ch-again" onClick={() => actions.onResend(l.id)} data-testid="send-again">{say("web.chat.send_again")}</button>
                    )}
                  </li>
                );
              })}
              {typing && (
                <li className="k-ch-row k-ch-theirs k-ch-typing" data-testid="typing" aria-hidden="true">
                  <p className="k-ch-bubble"><i /><i /><i /></p>
                </li>
              )}
            </ol>
            {game}
            {keysBlock}
          </section>
          <section className="k-panel k-pad8 k-ch-foot">
            <div className="k-ch-quick" role="list">
              {STRIP.map(({ id, icon }) => (
                <button key={id} type="button" role="listitem" className="k-ch-chip" aria-label={say(`web.sticker.${id}`)} onClick={() => void send(stickerText(id))} disabled={view.keysState !== "open"} data-testid={`quick-${id}`}>
                  <NdIcon name={icon} />
                </button>
              ))}
              <button type="button" role="listitem" className="k-ch-chip" aria-label={say("app.chat.quick.game")} onClick={actions.onGame} data-testid="quick-game"><NdIcon name="dice" /></button>
            </div>
            <form className="k-row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <input
                className="k-tk-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={say("app.chat.placeholder")}
                aria-label={say("app.chat.placeholder")} disabled={view.keysState !== "open"} data-testid="text"
              />
              <button type="submit" className="k-tk-send" aria-label={say("app.chat.send")} disabled={view.keysState !== "open" || !text.trim()} data-testid="send"><NdIcon name="send" /></button>
            </form>
            {view.error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{failedLine(new Error(view.error))}</p>}
          </section>
        </>
      )}
    </Frame>
    </OverlayCtx.Provider>
  );
}

/** The conversation held for the screen's life: the session, its clock, and what the pane asks of it. */
function Frame({ frame, title, over, keys, id, overlay, children }: { frame: "screen" | "pane"; title: string; over: boolean; keys: string; id: string; overlay: ReactNode; children: ReactNode }) {
  const data = { "data-over": over ? "1" : undefined, "data-keys": keys, "data-id": id };
  return frame === "screen"
    ? <Screen name="chat" title={title} className="k-screen" {...data}><div className="k-col">{children}</div>{overlay}</Screen>
    : <section className="ch ch-pane k-ch-pane" aria-label={title} data-testid="chat-pane" {...data}><div className="k-col">{children}</div>{overlay}</section>;
}

export function Chat({ client, keys, row, onBack, frame = "screen" }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void; frame?: "screen" | "pane" }) {
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
      <ChatPane view={view} now={now} frame={frame} menu={menu && !view.over ? (
        <ChatMenu span={view.span} busy={view.busy} waitingForPeer={view.waitingForPeer} actions={{
          onClose: closeMenu,
          onSpan: (span) => void session.changeSpan(span),
          onGame: () => { session.setGameOpen(!view.gameOpen); closeMenu(); },
          onSafety: () => { safety(); closeMenu(); },
          onRekey: () => { void session.rekey(view.askedByPeer ? "agree" : "ask"); closeMenu(); },
          onEnd: () => { closeMenu(); void session.endChat(); },
          onBlock: () => { closeMenu(); void session.block(); },
        }} />
      ) : undefined} game={view.gameOpen ? <ChatGame client={client} chatId={row.id} bump={view.gameBump} peer={row.name} onHide={() => session.setGameOpen(false)} /> : undefined} actions={{
        onBack,
        onSend: (line) => session.send(line),
        onResend: (id) => void session.resend(id),
        onMore: openMenu,
        onSafety: safety,
        onGame: () => session.setGameOpen(true),
        onRekey: () => void session.rekey(view.askedByPeer ? "agree" : "ask"),
        onSafetyBack: () => session.setSafety(null),
      }} />
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
