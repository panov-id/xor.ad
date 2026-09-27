// Screen 06/07 (chat spec §8.12): offers to talk first, conversations after,
// in one list from GET /inbox?since — the marks are the node's own events
// since the last look (P3: arrived, answered, opened, replies waiting, one's
// own term in its last fifth), shown as symbols, as depth shows them.
// The moment of the last look lives in this tab (sessionStorage): the first
// look of a tab sees everything live as new.

import { useEffect, useState } from "react";
import type { Client, InboxEvents } from "../../../depth/core/client.ts";
import type { ChatRow } from "../chat/keys.ts";
import { say } from "../locales/say.ts";
import "../chat/chat.css";

export interface MatchRow {
  kind: "match";
  id: string;
  name: string;
  age: number;
  phrase: { text: string; mode: string };
  waiting_for_you: boolean;
  state: string;
  // Whether I agreed already and wait for them (relay routes/inbox.ts, P10).
  my_consent?: "waiting" | "none";
  arrived_since?: boolean;
  answered_since?: boolean;
}

export type InboxChatRow = ChatRow & {
  name: string;
  age: number;
  state: "open" | "ended";
  chat_expires_at: number;
  my_span: number;
  opened_since?: boolean;
  pending_messages?: number;
  ending_soon?: boolean;
  last_activity_at?: number;
};

export type InboxRow = MatchRow | InboxChatRow;

const LAST_LOOK = "xor-inbox-last-look";

export function marksOf(r: InboxRow): string {
  const fresh = r.kind === "match"
    ? Boolean(r.arrived_since || r.answered_since)
    : Boolean(r.opened_since || (r.pending_messages ?? 0) > 0);
  const count = r.kind === "chat" && (r.pending_messages ?? 0) > 0 ? ` ${r.pending_messages}` : "";
  const soon = r.kind === "chat" && r.ending_soon;
  return `${fresh ? `●${count}` : ""}${soon ? (fresh ? " ⌛" : "⌛") : ""}`;
}

export function Inbox({ client, onOpenMatch, onOpenChat }: {
  client: Client;
  onOpenMatch: (row: MatchRow) => void;
  onOpenChat: (row: InboxChatRow) => void;
}) {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [events, setEvents] = useState<InboxEvents | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      const since = Number(sessionStorage.getItem(LAST_LOOK) ?? "") || undefined;
      const page = await client.inboxSince(since);
      setRows(page.items as unknown as InboxRow[]);
      setEvents(page.events);
      setState("ready");
      sessionStorage.setItem(LAST_LOOK, String(Math.floor(Date.now() / 1000)));
    } catch (e) {
      setError((e as Error).message);
      setState("failed");
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = rows.filter((r): r is MatchRow => r.kind === "match");
  const chats = rows.filter((r): r is InboxChatRow => r.kind === "chat");
  return (
    <main className="screen inbox" data-screen="inbox">
      <header>
        <h1>{say("web.inbox.title")}</h1>
        <button type="button" onClick={() => load()} data-testid="refresh">{say("web.inbox.refresh")}</button>
      </header>
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && rows.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>{say("web.inbox.empty")}</h2>
          <p className="muted">{say("web.inbox.empty_hint")}</p>
        </section>
      )}
      {matches.length > 0 && <h2>{say("web.inbox.offers")}</h2>}
      <ul className="cards" data-testid="matches">
        {matches.map((m) => (
          <li key={m.id} className="card" data-testid="match" data-id={m.id}>
            <div className="row">
              <strong>{m.name}, {m.age}</strong>
              <span className="mark">{marksOf(m)}</span>
            </div>
            <p>{m.phrase.text}</p>
            <span className="muted">{m.waiting_for_you ? say("web.inbox.waits_you") : say("web.inbox.offer")}</span>
            <button type="button" onClick={() => onOpenMatch(m)} data-testid="open-match">{say("inbox.enter")}</button>
          </li>
        ))}
      </ul>
      {chats.length > 0 && <h2>{say("web.inbox.chats")}</h2>}
      <ul className="cards" data-testid="chats">
        {chats.map((c) => (
          <li key={c.id} className="card" data-testid="chat" data-id={c.id} data-state={c.state}>
            <div className="row">
              <strong>{c.name}, {c.age}</strong>
              <span className="mark">{marksOf(c)}</span>
            </div>
            <span className="muted">{c.state === "ended" ? say("web.inbox.ended") : say("web.inbox.span", { n: c.my_span })}</span>
            <button type="button" onClick={() => onOpenChat(c)} data-testid="open-chat">{say("inbox.enter")}</button>
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
      {events && (
        <footer className="muted" data-testid="events">
          {say("web.inbox.since", { events: JSON.stringify(events) })}
        </footer>
      )}
    </main>
  );
}
