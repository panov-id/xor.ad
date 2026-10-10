// Screen 06 (chat spec §8.5): the offer to talk. "Поговорить" publishes this
// side's ephemeral half with the consent (§8.13); "не сейчас" is seen by this
// side only, and can be taken back while the match lives. The conversation
// opens for the first to press at once and waits for the second (owner's
// decision, 2026-09-18): lines written meanwhile wait on this device. The
// second's "не сейчас" turns that wait into the tombstone «предложение ушло»
// and takes the queue with it (Q9, §8.5): the wait asks the inbox for it.

import { type MatchLogic, useMatch } from "./logic/useMatch.ts";
import type { ChatKeys } from "../chat/keys.ts";
import type { Client } from "../../../depth/core/client.ts";
import type { MatchRow } from "./Inbox.tsx";
import { say } from "../locales/say.ts";
import "../chat/chat.css";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Chip } from "../ui/Chip.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Actions } from "../ui/Links.tsx";
import { Message, MessageLog, Tombstone } from "../ui/Message.tsx";
import { MessageInput } from "../ui/MessageInput.tsx";
import { Screen } from "../ui/Screen.tsx";
import { modes } from "../api/actions.ts";
import "./talk.css";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { lifeOf } from "../../../depth/core/life.ts";

// What is left of a phrase, as a bar (depth/core/life.ts): the other's end is
// never printed (screen 24; «чужой срок не числом», 19.09.2026). No end — the
// phrase has left the feed — no bar.
const BAR = { mine: "ui-bar ui-bar-mine", theirs: "ui-bar ui-bar-theirs" } as const;

export function Life({ end, tone }: { end?: number; tone: "mine" | "theirs" }) {
  const life = lifeOf(end);
  if (life === null) return null;
  const { left } = life;
  return (
    <span className={BAR[tone]} aria-hidden="true" data-testid={`life-${tone}`} data-left={left.toFixed(2)}>
      <span style={{ width: `${(left * 100).toFixed(1)}%` }} />
    </span>
  );
}

export function Match({ client, keys, row, onAgreed, onWaiting, onBack, onDeclined }: {
  client: Client;
  keys: ChatKeys;
  row: MatchRow;
  onAgreed: (chatId: string) => void;
  onWaiting: () => void;
  onBack: () => void;
  // "не сейчас" said or taken back here: the inbox keeps the row (W17).
  onDeclined?: (row: MatchRow, declined: boolean) => void;
}) {
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, mine, waiting, gone } = logic;

  return (
    <Screen
      name="match"
      title={`${row.name}, ${row.age}`}
      data-id={row.id}
      data-waiting={waiting ? "yes" : "no"}
      data-gone={gone ? "yes" : "no"}
      header={<HeaderScreen title={`${row.name}, ${row.age}`} onBack={onBack} backLabel={say("common.back")} />}
    >
      {/* Sheet 24, «Мэтч»: my phrase that was liked, then the other person's
          card on panel-2 — name, the mode as a chip, the phrase — each with
          what is left of it as a bar (the node tells the other's end to its
          match partner only, §8.11; never printed as a number, decision
          19.09.2026), then the hint with its accent edge. */}
      {mine && (
        <Card as="section" data-part="mine" data-testid="match-mine">
          <p>{mine.text}</p>
          <Life end={mine.expires_at} tone="mine" />
        </Card>
      )}
      <Card as="section" kind="nested" of="match" data-part="theirs">
        <strong>{row.name}, {row.age}</strong>
        <Chip label={modes().find((m) => m.value === row.phrase.mode)?.label ?? row.phrase.mode} />
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </Card>
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </Screen>
  );
}

// Under the match's cards, the same for every brand: the hint or the other's
// agreement, "talk" and "not now", the tombstone, the wait with its queue.
export function MatchBody({ row, keys, logic, onBack, onWaiting }: {
  row: MatchRow;
  keys: ChatKeys;
  logic: MatchLogic;
  onBack: () => void;
  onWaiting: () => void;
}) {
  const { busy, error, declined, waiting, gone, line, setLine, talk, notNow } = logic;
  return (
    <>
      {/* Sheet 06 B, waiting: no hint — the two phrases as short quotes, the
          lines in the queue, and the line to write at the foot. */}
      {!waiting && (
        row.waiting_for_you
          // the other side already agreed: a state, said in view
          ? <Card as="section" kind="nested" data-part="hint"><p>{say("web.match.agreed")}</p></Card>
          // how it works: an explanation, behind ⓘ
          : <div className="ui-info-row"><Info label={say("web.match.talk")} data-testid="match-hint"><p>{say("web.match.hint")}</p></Info></div>
      )}
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {!waiting && (
        <Actions>
          <Button kind="secondary" type="button" icon={declined ? "back" : "later"} className="ui-wide" aria-label={declined ? say("inbox.undo") : say("inbox.notNow")} disabled={busy} onClick={notNow} data-testid="not-now" />
          <Button kind="primary" type="button" icon="say" className="ui-wide" aria-label={say("web.match.talk")} disabled={busy || declined} onClick={talk} data-testid="talk" />
        </Actions>
      )}
      {waiting && gone && (
        <>
          <Tombstone title={say("web.match.gone")} data-testid="tombstone" />
          <Button type="button" icon="say" aria-label={say("web.match.to_inbox")} onClick={onBack} data-testid="to-inbox" />
        </>
      )}
      {waiting && !gone && (
        <section data-part="waiting" data-testid="waiting">
          <h2>{say("web.match.waiting")}</h2>
          <MessageLog label={say("web.match.waiting")} data-testid="queued">
            {keys.queued(row.id).map((l, i) => <Message key={i} side="mine" text={l} mark={say("chat.queued")} />)}
          </MessageLog>
          <div className="ui-icon-row">
            <Info label={say("web.match.waiting")} data-testid="queue-info"><p>{say("web.match.queue_hint")}</p></Info>
            <Button type="button" icon="say" aria-label={say("web.match.to_inbox")} onClick={onWaiting} data-testid="to-inbox" />
          </div>
          <MessageInput
            label={say("web.match.line")}
            placeholder={say("web.match.line")}
            sendLabel={say("web.match.enqueue")}
            value={line}
            onChange={setLine}
            onSend={(text) => { keys.queue(row.id, text); setLine(""); }}
            inputTestId="queued-line"
          />
        </section>
      )}
    </>
  );
}
