// Screen 06 (chat spec §8.5): the offer to talk. "Поговорить" publishes this
// side's ephemeral half with the consent (§8.13); "не сейчас" is seen by this
// side only, and can be taken back while the match lives. The conversation
// opens for the first to press at once and waits for the second (owner's
// decision, 2026-09-18): lines written meanwhile wait on this device.

import { useState } from "react";
import type { ChatKeys } from "../chat/keys.ts";
import type { Client } from "../../../depth/core/client.ts";
import type { MatchRow } from "./Inbox.tsx";
import { say } from "../locales/say.ts";
import "../chat/chat.css";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Chip } from "../ui/Chip.tsx";
import { modes } from "../api/actions.ts";
import "./talk.css";

type Phrase = { text: string; mode: string; expires_at?: number };

// A phrase lives 4 h 20 min in the feed (limits feed.phrase.span; relay
// lib/feed_verdict.ts PHRASE_SPAN): the bar is the share of that left.
const PHRASE_LIFE_SECONDS = (4 * 60 + 20) * 60;

// What is left of a phrase, as a bar only: the end is never printed (screen
// 24; «чужой срок не числом», 19.09.2026). No end — the phrase has left the
// feed — no bar.
function Life({ end, tone }: { end?: number; tone: "mine" | "theirs" }) {
  if (end === undefined) return null;
  const left = Math.max(0, Math.min(1, (end - Date.now() / 1000) / PHRASE_LIFE_SECONDS));
  return (
    <span className={`match-life match-life-${tone}`} aria-hidden="true" data-testid={`life-${tone}`} data-left={left.toFixed(2)}>
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
  // The row as GET /inbox gives it since N1: the other's end on `phrase`, and
  // my own phrase in the match as `my_phrase` (openapi InboxItem).
  const lived = row as MatchRow & { phrase: Phrase; my_phrase?: Phrase };
  const theirs = lived.phrase;
  const mine = lived.my_phrase;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  // The node remembers my consent (GET /inbox my_consent, P10): after a reload
  // the match I agreed to waits, and "Поговорить" is not offered again (W7).
  const [waiting, setWaiting] = useState(row.my_consent === "waiting");
  const [line, setLine] = useState("");

  async function talk() {
    setBusy(true);
    setError(null);
    try {
      const answer = await keys.consent(row.id);
      if (answer.status !== 200) throw new Error(`the consent was refused: ${answer.status} ${JSON.stringify(answer.body)}`);
      if (answer.body.state === "agreed" && answer.body.chat_id) return onAgreed(answer.body.chat_id);
      setWaiting(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    setBusy(true);
    setError(null);
    try {
      const answer = declined ? await client.undoDecline(row.id) : await client.decline(row.id);
      if (answer.status !== 204) throw new Error(`the node refused: ${answer.status}`);
      if (!declined) keys.dropQueued(row.id);
      setDeclined(!declined);
      onDeclined?.(row, !declined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen match" data-screen="match" data-id={row.id} data-waiting={waiting ? "yes" : "no"}>
      <header className="ui-header ui-header-rule">
        <button type="button" className="ui-icon" onClick={onBack} data-testid="back" aria-label={say("common.back")}>
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><path d="M26 14 L18 22 L26 30" /></svg>
        </button>
        <h1 className="ui-header-title">{row.name}, {row.age}</h1>
      </header>
      {/* Sheet 24, «Мэтч»: my phrase that was liked, then the other person's
          card on panel-2 — name, the mode as a chip, the phrase — each with
          what is left of it as a bar (the node tells the other's end to its
          match partner only, §8.11; never printed as a number, decision
          19.09.2026), then the hint with its accent edge. */}
      {mine && (
        <Card as="section" className="match-mine" data-testid="match-mine">
          <p>{mine.text}</p>
          <Life end={mine.expires_at} tone="mine" />
        </Card>
      )}
      <Card as="section" kind="nested" className="match-card">
        <strong>{row.name}, {row.age}</strong>
        <Chip label={modes().find((m) => m.value === row.phrase.mode)?.label ?? row.phrase.mode} />
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </Card>
      {/* Sheet 06 B, waiting: no hint — the two phrases as short quotes, the
          lines in the queue, and the line to write at the foot. */}
      {!waiting && (
        <Card as="section" kind="nested" className="match-hint">
          <p>{row.waiting_for_you ? say("web.match.agreed") : say("web.match.hint")}</p>
        </Card>
      )}
      {error && <p className="error" data-testid="error">{error}</p>}
      {!waiting && (
        <div className="actions">
          <Button kind="primary" type="button" disabled={busy || declined} onClick={talk} data-testid="talk">{say("web.match.talk")}</Button>
          <Button kind="secondary" type="button" disabled={busy} onClick={notNow} data-testid="not-now">{declined ? say("inbox.undo") : say("inbox.notNow")}</Button>
        </div>
      )}
      {waiting && (
        <section className="match-waiting" data-testid="waiting">
          <h2>{say("web.match.waiting")}</h2>
          <ul className="lines" data-testid="queued">
            {keys.queued(row.id).map((l, i) => <li key={i} className="line mine">{l}<span className="muted">{say("chat.queued")}</span></li>)}
          </ul>
          <p className="muted">{say("web.match.queue_hint")}</p>
          <Button kind="text" type="button" onClick={onWaiting} data-testid="to-inbox">{say("web.match.to_inbox")}</Button>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); if (line.trim()) { keys.queue(row.id, line.trim()); setLine(""); } }}>
            <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={say("web.match.line")} data-testid="queued-line" />
            <Button kind="secondary" type="submit">{say("web.match.enqueue")}</Button>
          </form>
        </section>
      )}
    </main>
  );
}
