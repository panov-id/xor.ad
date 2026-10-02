// Screen 08 (chat spec §8.6, §8.8, §8.13): the conversation. The keys come
// from web/src/chat/keys.ts — this device's pair after a consent, the wrap the
// node kept after a reload; the socket from web/src/chat/room.ts. What the
// node hands over is ciphertext with the message's id; it opens here with the
// peer's direction key, and is acknowledged once shown (POST /chats/:id/received).
// 4003 is the tombstone: "беседа кончилась", nothing to do.
//
// The reissue (§8.13): a device whose keys do not open asks for new ones; the
// other side is asked in person — "собеседник сменил устройство, выпустить
// новые ключи?" — and agrees with a press; both then derive and wrap anew.
// The row is read again from the inbox at each turn of the keys: the epochs
// are the node's report, the pair is ours.
// No history on disk: what is on the screen is what this tab has seen.

import { useChat } from "./logic/useChat.ts";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatKeys } from "../chat/keys.ts";
import { ChatActions } from "./ChatActions.tsx";
import { ChatGame } from "./ChatGame.tsx";
import type { InboxChatRow } from "./Inbox.tsx";
import "../chat/chat.css";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import "./talk.css";
import { Icon } from "../ui/Icon.tsx";
import { Info } from "../ui/Info.tsx";

export function Chat({ client, keys, row: given, onBack }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void }) {
  const {
    row, lines, text, setText, status, peerAway, missed, keysState, keysError, over, error, span, endsAt, quiet,
    changeSpan, endChat, block, blocked, safety, setSafety, busy, kept, gameOpen, setGameOpen, gameBump,
    send, rekey, askedByPeer, waitingForPeer, starters,
  } = useChat({ client, keys, row: given });
  return (
    <main className="screen chat" data-screen="chat" data-id={given.id} data-keys={keysState} data-over={over ? "yes" : "no"} data-epoch={row.key_epoch} data-rekey-requested={askedByPeer ? "yes" : "no"} data-span={span} data-ends-at={endsAt} data-counting={quiet.counting ? "yes" : "no"} data-blocked={blocked ? "yes" : "no"} data-peer-away={peerAway ? "yes" : "no"} data-missed={missed ? "yes" : "no"}>
      <header className="ui-header ui-header-rule">
        <button type="button" className="ui-icon ui-icon-only" onClick={onBack} data-testid="back" aria-label={say("common.back")}>
          <Icon name="back" />
        </button>
        <h1 className="ui-header-title">{row.name}, {row.age}{peerAway && <span className="peer-away" data-testid="peer-away"> · {say("chat.peerAway")}</span>}</h1>
      </header>
      {!over && missed && (
        <p className="warn" data-testid="missed">{say("web.chat.missed")}</p>
      )}
      {starters.length > 0 && (
        <section className="starters" data-testid="starters" aria-labelledby="starters-title">
          <h2 id="starters-title">{say("web.chat.starters")}</h2>
          <ol>
            {starters.map((s) => (
              <li key={s.position} data-testid="starter" data-position={s.position} data-liked-by={s.liked_by}>
                <span className="starter-mark">{s.position}. {say(s.liked_by === "me" ? "web.chat.you_liked" : "web.chat.they_liked")}</span>
                {s.removed ? <span className="muted" data-testid="starter-removed">{say("web.chat.starter_removed")}</span> : <q>{s.text}</q>}
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="status" data-testid="status">{"error" in status ? status.error : say(status.key, status.values)}</p>
      {/* One's own span, always in view (§8.6 «fades after 1h of YOUR silence»),
          and the counter once the silence has reached a quarter of it. */}
      {!over && (
        <div className="fades ui-icon-row" data-testid="fades" data-counting={quiet.counting ? "yes" : "no"}>
          <Info label={say("web.chat.span_label")} data-testid="fades-info"><p data-testid="fades-text">{say("chat.fades", { span: say(`chat.spanShort${span}`) })}</p></Info>
          {quiet.counting && <span data-testid="silence-clock"> · {quiet.clock}</span>}
        </div>
      )}
      {safety && <p className="code" data-testid="safety">{safety}</p>}
      {/* The handles (W11-A): the span, the end for both (W17; DELETE /chats/:id),
          the block asked twice (§8.9), and new keys asked of a healthy
          conversation too, as the terminal does (owner, 01.10.2026). */}
      {!over && (
        <ChatActions
          span={span}
          busy={busy}
          askedByPeer={askedByPeer}
          waitingForPeer={waitingForPeer}
          onSpan={(next) => void changeSpan(next)}
          onEnd={() => void endChat()}
          onBlock={() => void block()}
          onRekey={(action) => void rekey(action)}
        />
      )}
      {over && (
        <section className="tombstone" data-testid="tombstone">
          <h2>{say("web.chat.over_title")}</h2>
          <p className="muted">{say(blocked ? "web.chat.blocked" : "web.chat.over_text")}</p>
        </section>
      )}
      {!over && kept?.refused && (
        <p className="warn" data-testid="keys-not-kept">
          {say("web.chat.keys_not_kept", { reason: kept.refused })}
        </p>
      )}
      {!over && askedByPeer && (
        <Card as="section" data-testid="rekey-asked">
          <p>{say("web.chat.peer_moved")}</p>
          <Button kind="primary" type="button" icon="key" className="ui-wide" aria-label={say("web.chat.rekey_agree")} disabled={busy} onClick={() => rekey("agree")} data-testid="rekey-agree" />
        </Card>
      )}
      {!over && !askedByPeer && waitingForPeer && (
        <p className="muted" data-testid="rekey-waiting">{say("web.chat.rekey_waiting")}</p>
      )}
      {/* Keys that do not open: the reason here; the request for new ones is
          the same handle as for a healthy conversation, in the actions row. */}
      {!over && keysState === "failed" && !askedByPeer && !waitingForPeer && (
        <Card as="section" data-testid="keys-failed">
          <p className="error">{keysError}</p>
        </Card>
      )}
      {!over && gameOpen && <ChatGame client={client} chatId={given.id} bump={gameBump} />}
      <ul className="lines" data-testid="lines">
        {lines.map((l) => l.extra ? (
          <li key={l.id} className="line extra-like" data-testid="extra-like" data-position={l.extra.position} data-direction={l.extra.direction}>
            <span className="starter-mark">{l.extra.position}. {say(l.extra.direction === "they_liked_yours" ? "web.chat.extra_they" : "web.chat.extra_you")}</span>
            <q>{l.text}</q>
          </li>
        ) : (
          <li key={l.id} className={`line ${l.mine ? "mine" : "theirs"}`} data-testid={l.mine ? "mine" : "theirs"} data-state={l.state ?? ""}>
            {l.text}
            <span className="muted">{new Date(l.at * 1000).toTimeString().slice(0, 5)}{l.state === "failed" ? say("web.chat.not_delivered") : ""}</span>
          </li>
        ))}
      </ul>
      {error && <p className="error" data-testid="error">{error}</p>}
      {!over && (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={say("web.chat.line")} disabled={keysState !== "open"} data-testid="text" />
          <Button kind="primary" type="submit" icon="send" className="ui-mid" aria-label={say("chat.send")} disabled={keysState !== "open" || !text.trim()} data-testid="send" />
        </form>
      )}
      <footer className="muted">
        {!over && (
          <Button kind="secondary" type="button" icon="random" className="ui-wide" aria-label={say("web.game.title")} onClick={() => setGameOpen((o) => !o)} data-testid="game-toggle" aria-pressed={gameOpen} />
        )}
        <Button kind="secondary" type="button" icon="consent" className="ui-wide" aria-label={say("chat.code")} onClick={() => setSafety(keys.safetyCodeOf(given.id) ?? say("web.chat.keys_not_open"))} data-testid="show-safety" />
      </footer>
    </main>
  );
}
