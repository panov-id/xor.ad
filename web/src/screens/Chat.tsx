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
import { endsAtOf, resetEnd, shiftEnd, silence, spanOf, type Span } from "../chat/span.ts";
import { isPeerAway, missedSince, sawActivity } from "../chat/away.ts";
import { blockByChat, endChat as closeForBoth, setSpan } from "../api/chatActions.ts";
import { ChatActions } from "./ChatActions.tsx";
import { ChatGame } from "./ChatGame.tsx";
import type { InboxChatRow } from "./Inbox.tsx";
import "../chat/chat.css";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import "./talk.css";

interface Line {
  id: string; text: string; mine: boolean; at: number; state?: "sent" | "queued" | "failed";
  // An extra like (§8.7): a card in the middle, not a bubble.
  extra?: { position: number; direction: "they_liked_yours" | "you_liked_theirs" };
  // A line the node wrote, not the other side (§8.2: the changed age; W14-AG).
  system?: boolean;
}

// A starter of the conversation (chat spec: "Liked, in order"; relay
// routes/inbox.ts, N1): who liked it is told from this reader's side.
interface Starter { position: number; text: string; mode: string; liked_by: "me" | "them"; removed?: boolean }

type Status = { key: string; values?: Record<string, string | number> } | { error: string };

export function Chat({ client, keys, row: given, onBack }: { client: Client; keys: ChatKeys; row: InboxChatRow; onBack: () => void }) {
  const [row, setRow] = useState<InboxChatRow>(given);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  // The status is a state — a key of the dictionary and its values, or an
  // error's own text — and becomes words only when shown (W14): a check on
  // it never compares a translated line.
  const [status, setStatus] = useState<Status>({ key: "web.chat.opening_keys" });
  // The other side stepped away (§8.2, W12-AW): a mark in the header while
  // the field stays live; their first line here takes it off. And what this
  // tab did not see (§8.8): the row's last activity after the newest moment
  // this tab saw — said once on opening, taken off by what then arrives.
  const [peerAway, setPeerAway] = useState(false);
  // The other side's age as the header shows it: the row's, then the node's age_changed (W14-AG).
  const [peerAge, setPeerAge] = useState<number>(row.age);
  const [missed, setMissed] = useState(() => missedSince(given.id, given.last_activity_at));
  const [keysState, setKeysState] = useState<"opening" | "open" | "failed">("opening");
  const [keysError, setKeysError] = useState<string | null>(null);
  const [over, setOver] = useState(given.state === "ended");
  const [error, setError] = useState<string | null>(null);

  // One's own span and end (§8.6, W11-A): the row's my_span and chat_expires_at
  // are the node's report — one's own last message, or the chat's birth, plus
  // one's own span; from there the page keeps the clock itself, as
  // depth/ink/rooms.ts does, and the node sends nothing while it runs.
  const [span, setSpanState] = useState<Span>(() => spanOf(given.my_span));
  const [endsAt, setEndsAt] = useState<number>(() => endsAtOf(given.chat_expires_at, spanOf(given.my_span), Math.floor(Date.now() / 1000)));
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  const quiet = silence(endsAt, span, now);
  // One's own clock reaching zero is the same end the node's 4003 names,
  // seen from here (§8.10: the term is one's own).
  useEffect(() => {
    if (quiet.left === 0 && !over && keysState === "open") { setOver(true); setStatus({ key: "web.chat.over" }); }
  }, [quiet.left]); // eslint-disable-line react-hooks/exhaustive-deps

  // PATCH /chats/:id: what the node kept, not what was asked; and the end
  // moves with it, from the same last own message.
  async function changeSpan(next: Span) {
    setBusy(true);
    setError(null);
    try {
      const kept = await setSpan(client, given.id, next);
      setEndsAt((end) => shiftEnd(end, span, kept));
      setSpanState(kept);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // DELETE /chats/:id: the node closes it for both and sends 4003 to every
  // room; this screen needs no socket to say so.
  async function endChat() {
    setError(null);
    const done = await closeForBoth(client, given.id);
    if (!done.ok) return setError(`${done.status}`);
    setOver(true);
    setStatus({ key: "web.chat.over" });
  }

  // POST /blocks {chat} (§8.9): mutual and final — the conversation closes for
  // both, and the tombstone here says it was a block, which only this side knows.
  async function block() {
    setError(null);
    const done = await blockByChat(client, given.id);
    if (!done.ok) return setError(`${done.status}`);
    setBlocked(true);
    setOver(true);
    setStatus({ key: "web.chat.blocked" });
  }
  const [blocked, setBlocked] = useState(false);
  const [safety, setSafety] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState(0);
  const [kept, setKept] = useState<{ epoch: number; refused?: string } | null>(null);
  // The game in this conversation (GC3): shown on demand, read again on each
  // board or proposal frame the chat's socket brings.
  const [gameOpen, setGameOpen] = useState(false);
  const [gameBump, setGameBump] = useState(0);
  // Starters that came as extra_like frames while this screen was open; the
  // inbox row carries them too once it is read again.
  const [extraStarters, setExtraStarters] = useState<Starter[]>([]);
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
        setStatus((s) => ("key" in s && s.key === "web.chat.connected" ? s : { key: "web.chat.keys_ready" }));
        const flushed = await keys.flush(fresh);
        if (flushed.length > 0) setLines((was) => [...was, ...flushed.map((f) => ({ id: f.localId, text: f.text, mine: true, at: Date.now() / 1000, state: "sent" as const }))]);
        setKept(keys.keptOnNode(fresh.id));
      } catch (e) {
        if (!alive) return;
        setKeysState("failed");
        setKeysError((e as Error).message);
        setStatus({ error: (e as Error).message });
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
        case "connected": setStatus({ key: "web.chat.connected" }); break;
        case "reconnecting": setStatus({ key: "web.chat.reconnecting", values: { code: event.code, seconds: Math.round(event.inMs / 1000) } }); break;
        case "over": setOver(true); setStatus({ key: "web.chat.over" }); break;
        case "moved": setStatus({ key: "web.chat.moved" }); break;
        case "update": setStatus({ key: "web.chat.update" }); break;
        case "failed": setStatus({ key: "web.chat.failed", values: { message: event.message } }); break;
        case "rekey":
          // The other side published a half at a new epoch: asked, or agreed to
          // our request. Either way the row has moved; read it and turn the keys.
          setStatus({ key: "web.chat.rekeying", values: { epoch: event.epoch } });
          setTurn((t) => t + 1);
          break;
        case "extra_like": {
          // The same entity as a starter, arrived later (§8.7): a card with
          // the number the header gives it, and a row in the header.
          const liked_by = event.direction === "they_liked_yours" ? "them" : "me";
          setExtraStarters((was) => was.some((s) => s.position === event.position) ? was
            : [...was, { position: event.position, text: event.text, mode: event.mode, liked_by }]);
          const id = `extra-${event.position}`;
          setLines((was) => was.some((l) => l.id === id) ? was
            : [...was, { id, text: event.text, mine: false, at: Date.now() / 1000, extra: { position: event.position, direction: event.direction } }]);
          break;
        }
        case "sys": {
          if (isPeerAway(event.data)) { setPeerAway(true); break; }
          // The other side changed their age (§8.2 :1449; W14-AG): one system
          // line, the header follows. Only a number the node sent is a number.
          const sys = event.data as { kind?: unknown; age?: unknown } | null;
          if (sys?.kind === "age_changed") {
            if (typeof sys.age === "number" && Number.isFinite(sys.age)) {
              const age = sys.age;
              setPeerAge(age);
              setLines((was) => [...was, { id: `age-${Date.now()}-${age}`, text: say("chat.ageChanged", { age: String(age) }), mine: false, at: Date.now() / 1000, system: true }]);
            }
            break;
          }
          const type = (event.data as { type?: unknown } | null)?.type;
          if (type === "board" || type === "proposal") {
            setGameBump((n) => n + 1);
            if (type === "proposal") setGameOpen(true);
          }
          break;
        }
        case "message": {
          try {
            const opened = await keys.read(rowRef.current, event.ciphertext, event.id);
            setLines((was) => was.some((l) => l.id === event.id) ? was : [...was, { id: event.id, text: opened, mine: false, at: event.createdAt }]);
            // Their line: the away mark comes off (§8.2), and this tab has now
            // seen up to its moment — what reaches the row's last activity is
            // not missed any more.
            setPeerAway(false);
            sawActivity(given.id, event.createdAt);
            if (!missedSince(given.id, rowRef.current.last_activity_at)) setMissed(false);
            await client.received(given.id, [event.id]);
          } catch (e) {
            setLines((was) => [...was, { id: event.id, text: say("web.chat.not_opened", { message: (e as Error).message }), mine: false, at: event.createdAt, state: "failed" }]);
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
      if (answer.status === 404) { setOver(true); setStatus({ key: "web.chat.over" }); return; }
      if (answer.status !== 202) throw new Error(say("web.chat.not_sent", { status: answer.status, body: JSON.stringify(answer.body) }));
      setLines((was) => [...was, { id: localId, text: line, mine: true, at: Date.now() / 1000, state: answer.body.accepted ? "sent" : "failed" }]);
      // My own delivered message is what resets my silence (§8.6), and the
      // newest moment this tab saw (§8.8).
      if (answer.body.accepted) {
        setEndsAt(resetEnd(span, Math.floor(Date.now() / 1000)));
        sawActivity(given.id, Math.floor(Date.now() / 1000));
        setMissed(false);
      }
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
      if (answer.status !== 200) throw new Error(say("web.chat.rekey_refused", { status: answer.status, body: JSON.stringify(answer.body) }));
      setStatus(answer.body.state === "agreed" ? { key: "web.chat.rekey_agreed", values: { epoch: answer.body.epoch } } : { key: "web.chat.rekey_asked", values: { epoch: answer.body.epoch } });
      setTurn((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const askedByPeer = row.rekey_requested;
  const waitingForPeer = row.key_epoch > row.peer.key_epoch;
  // The header's list, by position: the number is the one an extra like's
  // card repeats, so it is the node's position and nothing else.
  const givenStarters = (row as InboxChatRow & { starters?: Starter[] }).starters ?? [];
  const starters = [...givenStarters, ...extraStarters.filter((e) => !givenStarters.some((s) => s.position === e.position))]
    .sort((a, b) => a.position - b.position);
  return (
    <main className="screen chat" data-screen="chat" data-id={given.id} data-keys={keysState} data-over={over ? "yes" : "no"} data-epoch={row.key_epoch} data-rekey-requested={askedByPeer ? "yes" : "no"} data-span={span} data-ends-at={endsAt} data-counting={quiet.counting ? "yes" : "no"} data-blocked={blocked ? "yes" : "no"} data-peer-away={peerAway ? "yes" : "no"} data-missed={missed ? "yes" : "no"}>
      <header className="ui-header ui-header-rule">
        <button type="button" className="ui-icon" onClick={onBack} data-testid="back" aria-label={say("common.back")}>
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><path d="M26 14 L18 22 L26 30" /></svg>
        </button>
        <h1 className="ui-header-title">{row.name}, {peerAge}{peerAway && <span className="muted peer-away" data-testid="peer-away"> · {say("chat.peerAway")}</span>}</h1>
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
        <p className="muted fades" data-testid="fades" data-counting={quiet.counting ? "yes" : "no"}>
          {say("chat.fades", { span: say(`chat.spanShort${span}`) })}
          {quiet.counting && <span data-testid="silence-clock"> · {quiet.clock}</span>}
        </p>
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
          <Button kind="primary" type="button" disabled={busy} onClick={() => rekey("agree")} data-testid="rekey-agree">{say("web.chat.rekey_agree")}</Button>
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
        ) : l.system ? (
          <li key={l.id} className="line system muted" data-testid="system">{l.text}</li>
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
          <Button kind="primary" type="submit" disabled={keysState !== "open" || !text.trim()} data-testid="send">{say("chat.send")}</Button>
        </form>
      )}
      <footer className="muted">
        {!over && (
          <Button kind="secondary" type="button" onClick={() => setGameOpen((o) => !o)} data-testid="game-toggle" aria-pressed={gameOpen}>{say("web.game.title")}</Button>
        )}
        <Button kind="secondary" type="button" onClick={() => setSafety(keys.safetyCodeOf(given.id) ?? say("web.chat.keys_not_open"))} data-testid="show-safety">{say("chat.code")}</Button>
      </footer>
    </main>
  );
}
