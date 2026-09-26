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

import { useEffect, useRef, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatKeys } from "../chat/keys.ts";
import { connectRoom } from "../chat/room.ts";
import type { InboxChatRow } from "./Inbox.tsx";
import "../chat/chat.css";

interface Line { id: string; text: string; mine: boolean; at: number; state?: "sent" | "queued" | "failed" }

export function Chat({ client, keys, row: given, onBack }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void }) {
  const [row, setRow] = useState<InboxChatRow>(given);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("открываем ключи…");
  const [keysState, setKeysState] = useState<"opening" | "open" | "failed">("opening");
  const [keysError, setKeysError] = useState<string | null>(null);
  const [over, setOver] = useState(given.state === "ended");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState(0);
  const [kept, setKept] = useState<{ epoch: number; refused?: string } | null>(null);
  const stop = useRef<{ stop(): void } | null>(null);
  const rowRef = useRef(row);
  rowRef.current = row;

  // The row as the node reports it now — the epochs above all.
  async function refreshRow(): Promise<InboxChatRow | null> {
    const fresh = (await client.inbox()).find((i) => i.kind === "chat" && i.id === given.id) as InboxChatRow | undefined;
    if (fresh) setRow(fresh);
    return fresh ?? null;
  }

  // The keys, at each turn: after mount, after a reissue asked or agreed.
  useEffect(() => {
    let alive = true;
    (async () => {
      setKeysState("opening");
      setKeysError(null);
      const fresh = (await refreshRow().catch(() => null)) ?? rowRef.current;
      try {
        await keys.open(fresh);
        if (!alive) return;
        setKeysState("open");
        setStatus((s) => (s.startsWith("на связи") ? s : "ключи на месте"));
        const flushed = await keys.flush(fresh);
        if (flushed.length > 0) setLines((was) => [...was, ...flushed.map((f) => ({ id: f.localId, text: f.text, mine: true, at: Date.now() / 1000, state: "sent" as const }))]);
        setKept(keys.keptOnNode(fresh.id));
      } catch (e) {
        if (!alive) return;
        setKeysState("failed");
        setKeysError((e as Error).message);
        setStatus((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  // The socket, once for the screen's life; frames open with whatever keys
  // stand at the moment they arrive.
  useEffect(() => {
    if (over) return;
    let alive = true;
    stop.current = connectRoom(client, given.id, async (event) => {
      if (!alive) return;
      switch (event.kind) {
        case "connected": setStatus("на связи"); break;
        case "reconnecting": setStatus(`связь прервалась (${event.code}), снова через ${Math.round(event.inMs / 1000)} с`); break;
        case "over": setOver(true); setStatus("беседа кончилась"); break;
        case "moved": setStatus("личность перенесена на другое устройство"); break;
        case "update": setStatus("узел говорит на другой версии протокола — обновите страницу"); break;
        case "failed": setStatus(`не подключиться: ${event.message}`); break;
        case "rekey":
          // The other side published a half at a new epoch: asked, or agreed to
          // our request. Either way the row has moved; read it and turn the keys.
          setStatus(`ключи беседы меняются (эпоха ${event.epoch})`);
          setTurn((t) => t + 1);
          break;
        case "sys": break;
        case "message": {
          try {
            const opened = await keys.read(rowRef.current, event.ciphertext, event.id);
            setLines((was) => was.some((l) => l.id === event.id) ? was : [...was, { id: event.id, text: opened, mine: false, at: event.createdAt }]);
            await client.received(given.id, [event.id]);
          } catch (e) {
            setLines((was) => [...was, { id: event.id, text: `(не открылось: ${(e as Error).message})`, mine: false, at: event.createdAt, state: "failed" }]);
          }
        }
      }
    });
    return () => { alive = false; stop.current?.stop(); };
  }, [given.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const line = text.trim();
    if (!line) return;
    setError(null);
    try {
      const { localId, answer } = await keys.say(rowRef.current, line);
      if (answer.status === 404) { setOver(true); setStatus("беседа кончилась"); return; }
      if (answer.status !== 202) throw new Error(`не отправлено: ${answer.status} ${JSON.stringify(answer.body)}`);
      setLines((was) => [...was, { id: localId, text: line, mine: true, at: Date.now() / 1000, state: answer.body.accepted ? "sent" : "failed" }]);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rekey(action: "ask" | "agree") {
    setBusy(true);
    setError(null);
    try {
      const fresh = (await refreshRow()) ?? rowRef.current;
      const answer = action === "ask" ? await keys.requestRekey(fresh) : await keys.acceptRekey(fresh);
      if (answer.status !== 200) throw new Error(`перевыпуск отклонён: ${answer.status} ${JSON.stringify(answer.body)}`);
      setStatus(answer.body.state === "agreed" ? `новые ключи выпущены (эпоха ${answer.body.epoch})` : `просьба о новых ключах отправлена (эпоха ${answer.body.epoch}), ждём согласия`);
      setTurn((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const askedByPeer = row.rekey_requested;
  const waitingForPeer = row.key_epoch > row.peer.key_epoch;
  return (
    <main className="screen chat" data-screen="chat" data-id={given.id} data-keys={keysState} data-over={over ? "yes" : "no"} data-epoch={row.key_epoch} data-rekey-requested={askedByPeer ? "yes" : "no"}>
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
      {!over && kept?.refused && (
        <p className="warn" data-testid="keys-not-kept">
          Узел не сохранил ключи этой беседы ({kept.refused}): после перезагрузки страницы беседу будет не открыть — попросите новые ключи тогда.
        </p>
      )}
      {!over && askedByPeer && (
        <section className="card" data-testid="rekey-asked">
          <p>Собеседник сменил устройство и просит выпустить новые ключи. Прежние сообщения не вернутся.</p>
          <button type="button" className="primary" disabled={busy} onClick={() => rekey("agree")} data-testid="rekey-agree">выпустить новые ключи</button>
        </section>
      )}
      {!over && !askedByPeer && waitingForPeer && (
        <p className="muted" data-testid="rekey-waiting">Просьба о новых ключах отправлена — ждём, когда согласится собеседник.</p>
      )}
      {!over && keysState === "failed" && !askedByPeer && !waitingForPeer && (
        <section className="card" data-testid="keys-failed">
          <p className="error">{keysError}</p>
          <button type="button" disabled={busy} onClick={() => rekey("ask")} data-testid="rekey-ask">попросить новые ключи</button>
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
        <button type="button" onClick={() => setSafety(keys.safetyCodeOf(given.id) ?? "ключи ещё не открыты")} data-testid="show-safety">код безопасности</button>
      </footer>
    </main>
  );
}
