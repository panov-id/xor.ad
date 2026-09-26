// Screen 08 (chat spec §8.6, §8.8, §8.13): the conversation. The keys come
// from web/src/chat/keys.ts — this device's pair after a consent, the wrap the
// node kept after a reload; the socket from web/src/chat/room.ts. What the
// node hands over is ciphertext with the message's id; it opens here with the
// peer's direction key, and is acknowledged once shown (POST /chats/:id/received).
// 4003 is the tombstone: "предложение ушло / беседа кончилась", nothing to do.
// No history on disk: what is on the screen is what this tab has seen.

import { useEffect, useRef, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatKeys } from "../chat/keys.ts";
import { connectRoom } from "../chat/room.ts";
import type { InboxChatRow } from "./Inbox.tsx";
import "../chat/chat.css";

interface Line { id: string; text: string; mine: boolean; at: number; state?: "sent" | "queued" | "failed" }

export function Chat({ client, keys, row, onBack }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("открываем ключи…");
  const [keysState, setKeysState] = useState<"opening" | "open" | "failed">("opening");
  const [over, setOver] = useState(row.state === "ended");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const stop = useRef<{ stop(): void } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await keys.open(row);
        if (!alive) return;
        setKeysState("open");
        setStatus("ключи на месте");
        const flushed = await keys.flush(row);
        if (flushed > 0) setLines((was) => [...was, ...Array.from({ length: flushed }, (_, i) => ({ id: `flushed-${i}`, text: "(строка из очереди отправлена)", mine: true, at: Date.now() / 1000, state: "sent" as const }))]);
      } catch (e) {
        if (!alive) return;
        setKeysState("failed");
        setStatus((e as Error).message);
        return;
      }
      if (over) return;
      stop.current = connectRoom(client, row.id, async (event) => {
        if (!alive) return;
        switch (event.kind) {
          case "connected": setStatus("на связи"); break;
          case "reconnecting": setStatus(`связь прервалась (${event.code}), снова через ${Math.round(event.inMs / 1000)} с`); break;
          case "over": setOver(true); setStatus("беседа кончилась"); break;
          case "moved": setStatus("личность перенесена на другое устройство"); break;
          case "update": setStatus("узел говорит на другой версии протокола — обновите страницу"); break;
          case "failed": setStatus(`не подключиться: ${event.message}`); break;
          case "rekey": setStatus(`собеседник просит новые ключи (эпоха ${event.epoch})`); break;
          case "sys": break;
          case "message": {
            try {
              const opened = await keys.read(row, event.ciphertext, event.id);
              setLines((was) => was.some((l) => l.id === event.id) ? was : [...was, { id: event.id, text: opened, mine: false, at: event.createdAt }]);
              await client.received(row.id, [event.id]);
            } catch (e) {
              setLines((was) => [...was, { id: event.id, text: `(не открылось: ${(e as Error).message})`, mine: false, at: event.createdAt, state: "failed" }]);
            }
          }
        }
      });
    })();
    return () => { alive = false; stop.current?.stop(); };
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const line = text.trim();
    if (!line) return;
    setError(null);
    try {
      const { localId, answer } = await keys.say(row, line);
      if (answer.status === 404) { setOver(true); setStatus("беседа кончилась"); return; }
      if (answer.status !== 202) throw new Error(`не отправлено: ${answer.status} ${JSON.stringify(answer.body)}`);
      setLines((was) => [...was, { id: localId, text: line, mine: true, at: Date.now() / 1000, state: answer.body.accepted ? "sent" : "failed" }]);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="screen chat" data-screen="chat" data-id={row.id} data-keys={keysState} data-over={over ? "yes" : "no"}>
      <header>
        <h1>{row.name}, {row.age}</h1>
        <button type="button" onClick={onBack} data-testid="back">назад</button>
      </header>
      <p className="status" data-testid="status">{status}</p>
      {safety && <p className="code" data-testid="safety">{safety}</p>}
      {over && (
        <section className="tombstone" data-testid="tombstone">
          <h2>Беседа кончилась</h2>
          <p className="muted">Ключи стёрты у обоих. Прочитать это больше нечем — никому.</p>
        </section>
      )}
      <ul className="lines" data-testid="lines">
        {lines.map((l) => (
          <li key={l.id} className={`line ${l.mine ? "mine" : "theirs"}`} data-testid={l.mine ? "mine" : "theirs"} data-state={l.state ?? ""}>
            {l.text}
            <span className="muted">{new Date(l.at * 1000).toTimeString().slice(0, 5)}{l.state === "failed" ? " · не доставлено" : ""}</span>
          </li>
        ))}
      </ul>
      {error && <p className="error" data-testid="error">{error}</p>}
      {!over && (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="реплика" disabled={keysState !== "open"} data-testid="text" />
          <button type="submit" className="primary" disabled={keysState !== "open" || !text.trim()} data-testid="send">отправить</button>
        </form>
      )}
      <footer className="muted">
        <button type="button" onClick={() => setSafety(keys.safetyCodeOf(row.id) ?? "ключи ещё не открыты")} data-testid="show-safety">код безопасности</button>
      </footer>
    </main>
  );
}
