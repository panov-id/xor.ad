// Screen 06 (chat spec §8.5): the offer to talk. "Поговорить" publishes this
// side's ephemeral half with the consent (§8.13); "не сейчас" is seen by this
// side only, and can be taken back while the match lives. The conversation
// opens for the first to press at once and waits for the second (owner's
// decision, 2026-09-18): lines written meanwhile wait on this device.

import { useState } from "react";
import type { ChatKeys } from "../chat/keys.ts";
import type { Client } from "../../../depth/core/client.ts";
import type { MatchRow } from "./Inbox.tsx";
import "../chat/chat.css";

export function Match({ client, keys, row, onAgreed, onWaiting, onBack }: {
  client: Client;
  keys: ChatKeys;
  row: MatchRow;
  onAgreed: (chatId: string) => void;
  onWaiting: () => void;
  onBack: () => void;
}) {
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen match" data-screen="match" data-id={row.id} data-waiting={waiting ? "yes" : "no"}>
      <header>
        <h1>{row.name}, {row.age}</h1>
        <button type="button" onClick={onBack} data-testid="back">назад</button>
      </header>
      <section className="card">
        <p>{row.phrase.text}</p>
        <span className="muted">{row.phrase.mode}</span>
      </section>
      <p className="muted">
        {row.waiting_for_you ? "Уже согласились и ждут вас." : "Поговорить — и, когда согласятся оба, откроется беседа. Ключи беседы рождаются у вас двоих, узел их не видит."}
      </p>
      {error && <p className="error" data-testid="error">{error}</p>}
      {!waiting && (
        <div className="actions">
          <button type="button" className="primary" disabled={busy || declined} onClick={talk} data-testid="talk">поговорить</button>
          <button type="button" disabled={busy} onClick={notNow} data-testid="not-now">{declined ? "вернуть" : "не сейчас"}</button>
        </div>
      )}
      {waiting && (
        <section data-testid="waiting">
          <h2>Ждём ответа</h2>
          <p className="muted">Можно писать: строки лежат на этом устройстве и уйдут, когда согласятся.</p>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); if (line.trim()) { keys.queue(row.id, line.trim()); setLine(""); } }}>
            <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="строка" data-testid="queued-line" />
            <button type="submit">в очередь</button>
          </form>
          <ul className="lines" data-testid="queued">
            {keys.queued(row.id).map((l, i) => <li key={i} className="line mine">{l}<span className="muted">ждёт</span></li>)}
          </ul>
          <button type="button" onClick={onWaiting} data-testid="to-inbox">к разговорам</button>
        </section>
      )}
    </main>
  );
}
