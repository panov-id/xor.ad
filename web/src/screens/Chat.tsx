// Screen 08 (chat spec §8.6, §8.8, §8.13): the conversation. The keys come
// from depth/web-platform/chat/keys.ts — this device's pair after a consent, the wrap the
// node kept after a reload; the socket from depth/web-platform/chat/room.ts. What the
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
// Kit elements only (K5): Message, Starters, Tombstone, Status inline, MessageInput.

import { useChat } from "./logic/useChat.ts";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatKeys } from "../../../depth/web-platform/chat/keys.ts";
import { useState } from "react";
import { ChatActions, ChatMenuButton } from "./ChatActions.tsx";
import { ChatGame } from "./ChatGame.tsx";
import type { InboxChatRow } from "./Inbox.tsx";
import "../chat/chat.css";
import { say } from "../locales/say.ts";
import { duration } from "../locales/duration.ts";
import { Actions } from "../ui/Links.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import "./talk.css";
import { Code } from "../ui/Code.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Message, MessageLog, Starters, Tombstone } from "../ui/Message.tsx";
import { MessageInput } from "../ui/MessageInput.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { STICKERS, Sticker } from "../ui/Sticker.tsx";
import { stickerOf, stickerText } from "../chat/sticker.ts";
import { StatusInline } from "../ui/Status.tsx";

const hhmm = (seconds: number) => new Date(seconds * 1000).toTimeString().slice(0, 5);

export function Chat({ client, keys, row: given, onBack, brandClass }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void; brandClass?: string }) {
  const {
    row, lines, text, setText, status, peerAway, peerAge, missed, keysState, keysError, over, error, span, endsAt, quiet,
    changeSpan, endChat, block, blocked, safety, setSafety, busy, kept, gameOpen, setGameOpen, gameBump,
    send, resend, rekey, askedByPeer, waitingForPeer, starters,
  } = useChat({ client, keys, row: given });
  const who = `${row.name}, ${peerAge}`;
  const [menu, setMenu] = useState(false);
  const [plate, setPlate] = useState(false);
  const showSafety =() => setSafety(keys.safetyCodeOf(given.id) ?? say("web.chat.keys_not_open"));
  return (
    <Screen
      name="chat"
      title={who}
      className={brandClass}
      data-id={given.id}
      data-keys={keysState}
      data-over={over ? "yes" : "no"}
      data-epoch={row.key_epoch}
      data-rekey-requested={askedByPeer ? "yes" : "no"}
      data-span={span}
      data-ends-at={endsAt}
      data-counting={quiet.counting ? "yes" : "no"}
      data-blocked={blocked ? "yes" : "no"}
      data-peer-away={peerAway ? "yes" : "no"}
      data-missed={missed ? "yes" : "no"}
      header={<HeaderScreen title={who} onBack={onBack} backLabel={say("common.back")} action={over ? undefined : <ChatMenuButton open={menu} onOpen={() => setMenu(true)} />} />}
    >
      {peerAway && <StatusInline data-testid="peer-away">{`${row.name} · ${say("chat.peerAway")}`}</StatusInline>}
      {!over && missed && <Notice data-testid="missed">{say("web.chat.missed")}</Notice>}
      {starters.length > 0 && (
        <Starters
          title={say("web.chat.starters")}
          data-testid="starters"
          items={starters.map((s) => ({
            position: s.position,
            mark: say(s.liked_by === "me" ? "web.chat.you_liked" : "web.chat.they_liked"),
            text: s.text,
            removed: s.removed ? say("web.chat.starter_removed") : undefined,
            likedBy: s.liked_by,
          }))}
        />
      )}
      {safety && <Code value={safety} data-testid="safety" />}
      {/* The handles (W11-A): the span, the end for both (W17; DELETE /chats/:id),
          the block asked twice (§8.9), and new keys asked of a healthy
          conversation too, as the terminal does (owner, 01.10.2026). */}
      {!over && (
        <ChatActions
          menu={menu}
          onMenuClose={() => setMenu(false)}
          span={span}
          busy={busy}
          askedByPeer={askedByPeer}
          waitingForPeer={waitingForPeer}
          gameOpen={gameOpen}
          onSpan={(next) => void changeSpan(next)}
          onEnd={() => void endChat()}
          onBlock={() => void block()}
          onRekey={(action) => void rekey(action)}
          onGame={() => setGameOpen((o) => !o)}
          onSafety={showSafety}
        />
      )}
      {over && <Tombstone title={say("web.chat.over_title")} text={say(blocked ? "web.chat.blocked" : "web.chat.over_text")} data-testid="tombstone" />}
      {!over && kept?.refused && <Notice data-testid="keys-not-kept">{say("web.chat.keys_not_kept", { reason: kept.refused })}</Notice>}
      {!over && askedByPeer && (
        <Card as="section" data-testid="rekey-asked">
          <p>{say("web.chat.peer_asks")}</p>
          <Button kind="primary" type="button" icon="key" className="ui-wide" aria-label={say("web.chat.rekey_agree")} disabled={busy} onClick={() => rekey("agree")} data-testid="rekey-agree" />
        </Card>
      )}
      {!over && !askedByPeer && waitingForPeer && (
        <p className="ui-hint" data-testid="rekey-waiting">{say("web.chat.rekey_waiting")}</p>
      )}
      {/* Keys that do not open: the reason here; the request for new ones is
          the same handle as for a healthy conversation, in the actions row. */}
      {!over && keysState === "failed" && !askedByPeer && !waitingForPeer && (
        <Card as="section" data-testid="keys-failed">
          <ErrorLine>{keysError}</ErrorLine>
        </Card>
      )}
      {!over && gameOpen && <ChatGame client={client} chatId={given.id} bump={gameBump} />}
      <MessageLog label={who} data-testid="lines">
        {lines.map((l) => l.extra ? (
          <Message
            key={l.id}
            side="extra"
            text={l.text}
            mark={`${l.extra.position}. ${say(l.extra.direction === "they_liked_yours" ? "web.chat.extra_they" : "web.chat.extra_you")}`}
            data-testid="extra-like"
            data-position={l.extra.position}
            data-direction={l.extra.direction}
          />
        ) : l.system ? (
          <Message key={l.id} side="system" text={l.text} data-testid="system" />
        ) : (
          <Message
            key={l.id}
            side={l.mine ? "mine" : "theirs"}
            who={row.name}
            text={stickerOf(l.text) ? say(`web.sticker.${stickerOf(l.text)}`) : l.text}
            art={stickerOf(l.text) ? <Sticker id={stickerOf(l.text)!} size={128} /> : undefined}
            time={hhmm(l.at)}
            // Not stored by the node: it goes again by itself, and now on a press (W14-RS).
            failed={l.state === "failed"}
            onAgain={() => void resend(l.id)}
            data-testid={l.mine ? "mine" : "theirs"}
            data-state={l.state ?? ""}
          />
        ))}
      </MessageLog>
      {/* Under the lines (sheet adaptive-*-chat-393): one's own span as a pill, always in view (§8.6 «fades
          after 1h of YOUR silence»), and the counter once the silence has reached a quarter of it; the link's state. */}
      {!over && (
        <p className="ui-icon-row" data-part="fades" data-testid="fades" data-counting={quiet.counting ? "yes" : "no"}>
          <Icon name="timer" size={20} />
          <span data-testid="fades-text">{say("chat.fades", { left: duration(span) })}</span>
          {quiet.counting && <span data-testid="silence-clock"> · {quiet.clock}</span>}
        </p>
      )}
      <StatusInline data-testid="status">{"error" in status ? status.error : say(status.key, status.values)}</StatusInline>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {/* The eight on one plate of 4×2 over the line, each with its word; one tap sends, the plate stays up
          (sheet adaptive-*-chat-stickers-*). */}
      {!over && plate && (
        <div role="group" aria-label={say("web.sticker.title")} data-part="sticker-plate" data-testid="sticker-plate">
          {STICKERS.map((id) => (
            <button key={id} type="button" disabled={keysState !== "open"} onClick={() => void send(stickerText(id))} data-testid={`chat-sticker-${id}`}>
              <Sticker id={id} size={66} />
              <span>{say(`web.sticker.${id}`)}</span>
            </button>
          ))}
        </div>
      )}
      {!over && (
        <MessageInput
          label={say("web.chat.line")}
          placeholder={say("web.chat.line")}
          sendLabel={say("chat.send")}
          value={text}
          onChange={setText}
          onSend={() => void send()}
          disabled={keysState !== "open"}
          reason={keysState !== "open" ? say("web.chat.keys_not_open") : undefined}
          inputTestId="text"
          sendTestId="send"
          extra={<Button kind="secondary" type="button" icon="sticker" aria-label={say("web.sticker.title")} aria-pressed={plate} onClick={() => setPlate((p) => !p)} data-testid="stickers-key" />}
        />
      )}
      {/* Ended, there is no «…»: the safety code alone stays reachable, in words. */}
      {over && (
        <Actions>
          <Button kind="secondary" type="button" onClick={showSafety} data-testid="show-safety">{say("chat.code")}</Button>
        </Actions>
      )}
    </Screen>
  );
}
