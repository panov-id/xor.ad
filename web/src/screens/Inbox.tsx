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
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import "./talk.css";

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

export function Inbox({ client, onOpenMatch, onOpenChat, declined = [], onUndone }: {
  client: Client;
  onOpenMatch: (row: MatchRow) => void;
  onOpenChat: (row: InboxChatRow) => void;
  // Declined in this page's life (W17): the node leaves them out of the list,
  // and they stay here as "отклонено · вернуть" until the page goes, as the
  // terminal keeps them in its process (depth/ink/rooms.ts, §4.6).
  declined?: MatchRow[];
  onUndone?: (row: MatchRow) => void;
}) {
  const [undoing, setUndoing] = useState<string | null>(null);
  async function undo(row: MatchRow) {
    setUndoing(row.id);
    try {
      const answer = await client.undoDecline(row.id);
      if (answer.status !== 204) throw new Error(`${answer.status}`);
      onUndone?.(row);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUndoing(null);
    }
  }
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
      <header className="ui-header ui-header-rule">
        <h1 className="ui-header-title">{say("web.inbox.title")}</h1>
        <Button kind="secondary" type="button" onClick={() => load()} data-testid="refresh">{say("web.inbox.refresh")}</Button>
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
          <Card as="li" key={m.id} kind="nested" data-testid="match" data-id={m.id}>
            <div className="row">
              <strong>{m.name}, {m.age}</strong>
              <span className="mark">{marksOf(m)}</span>
            </div>
            <p>{m.phrase.text}</p>
            <span className="muted">{m.waiting_for_you ? say("web.inbox.waits_you") : say("web.inbox.offer")}</span>
            <Button kind="secondary" type="button" onClick={() => onOpenMatch(m)} data-testid="open-match">{say("inbox.enter")}</Button>
          </Card>
        ))}
        {declined.filter((d) => !matches.some((m) => m.id === d.id)).map((d) => (
          <Card as="li" key={d.id} className="declined" kind="nested" data-testid="match" data-id={d.id} data-declined="yes">
            <div className="row">
              <strong>{d.name}, {d.age}</strong>
              <span className="mark">{say("inbox.declined")}</span>
            </div>
            <p>{d.phrase.text}</p>
            <Button kind="secondary" type="button" disabled={undoing === d.id} onClick={() => void undo(d)} data-testid="undo-decline">{say("inbox.undo")}</Button>
          </Card>
        ))}
      </ul>
      {chats.length > 0 && <h2>{say("web.inbox.chats")}</h2>}
      <ul className="cards" data-testid="chats">
        {chats.map((c) => (
          <Card as="li" key={c.id}data-testid="chat" data-id={c.id} data-state={c.state}>
            <div className="row">
              <strong>{c.name}, {c.age}</strong>
              <span className="mark">{marksOf(c)}</span>
            </div>
            <span className="muted">{c.state === "ended" ? say("web.inbox.ended") : say("web.inbox.span", { n: c.my_span })}</span>
            <Button kind="secondary" type="button" onClick={() => onOpenChat(c)} data-testid="open-chat">{say("inbox.enter")}</Button>
          </Card>
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
