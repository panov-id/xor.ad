// Screen 06/07 (chat spec §8.12): offers to talk first, conversations after,
// in one list from GET /inbox?since — the marks are the node's own events
// since the last look (P3: arrived, answered, opened, replies waiting, one's
// own term in its last fifth), shown as symbols, as depth shows them.
// The moment of the last look lives in this tab (sessionStorage): the first
// look of a tab sees everything live as new.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatRow } from "../chat/keys.ts";
import { say } from "../locales/say.ts";
import "../chat/chat.css";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import "./talk.css";
import { HeaderScreen } from "../ui/Header.tsx";

export interface MatchRow {
  kind: "match";
  id: string;
  name: string;
  age: number;
  phrase: { text: string; mode: string };
  waiting_for_you: boolean;
  state: string;
  // Whether I agreed already and wait for them (relay routes/inbox.ts, P10).
  // "gone" since Q9: I agreed and the other said "not now" (§8.5).
  my_consent?: "waiting" | "none" | "gone";
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
  const [tab, setTab] = useState<"offers" | "chats" | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      const since = Number(sessionStorage.getItem(LAST_LOOK) ?? "") || undefined;
      const page = await client.inboxSince(since);
      setRows(page.items as unknown as InboxRow[]);
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
  const shown = tab ?? (chats.length > 0 ? "chats" : "offers");
  return (
    <main className="screen inbox" data-screen="inbox">
      <HeaderScreen title={say("web.inbox.title")} action={<Button kind="primary" type="button" icon="refresh" aria-label={say("web.inbox.refresh")} onClick={() => load()} data-testid="refresh" />} />
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && rows.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>{say("web.inbox.empty")}</h2>
          <p className="muted">{say("web.inbox.empty_hint")}</p>
        </section>
      )}
      {/* Two tabs, as the bottom row of screen-20-21-22-24: offers to talk and
          conversations; the dot says a tab holds something new since the last
          look. It opens on the conversations when there are any. */}
      {rows.length + declined.length > 0 && (
        <div className="talk-tabs" role="tablist" aria-label={say("web.inbox.title")}>
          {(["offers", "chats"] as const).map((t) => (
            <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={shown === t}
              className={shown === t ? "talk-tab talk-tab-on" : "talk-tab"} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
              {say(t === "offers" ? "web.inbox.offers" : "web.inbox.chats")}
              {(t === "offers" ? matches : chats).some((r) => marksOf(r).startsWith("●")) && <span className="ui-dot talk-tab-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
      <ul className="cards" data-testid="matches" role="tabpanel" id="panel-offers" aria-labelledby="tab-offers" hidden={shown !== "offers"}>
        {shown === "offers" && matches.map((m) => (
          <Card as="li" key={m.id} kind="nested" data-testid="match" data-id={m.id}>
            <div className="row">
              <strong>{m.name}, {m.age}</strong>
              <span className="mark">{marksOf(m)}</span>
            </div>
            <p>{m.phrase.text}</p>
            <span className="muted">{m.waiting_for_you ? say("web.inbox.waits_you") : say("web.inbox.offer")}</span>
            <Button kind="secondary" type="button" icon="open" className="ui-mid" aria-label={say("inbox.enter")} onClick={() => onOpenMatch(m)} data-testid="open-match" />
          </Card>
        ))}
        {shown === "offers" && declined.filter((d) => !matches.some((m) => m.id === d.id)).map((d) => (
          <Card as="li" key={d.id} className="declined" kind="nested" data-testid="match" data-id={d.id} data-declined="yes">
            <div className="row">
              <strong>{d.name}, {d.age}</strong>
              <span className="mark">{say("inbox.declined")}</span>
            </div>
            <p>{d.phrase.text}</p>
            <Button kind="secondary" type="button" icon="back" className="ui-mid" aria-label={say("inbox.undo")} disabled={undoing === d.id} onClick={() => void undo(d)} data-testid="undo-decline" />
          </Card>
        ))}
      </ul>
      {/* A conversation is the kit's row-chat: name, a line, the marks; the dot
          and «ждёт вас» on the right when replies wait. */}
      <ul className="rows talk-chats" data-testid="chats" role="tabpanel" id="panel-chats" aria-labelledby="tab-chats" hidden={shown !== "chats"}>
        {shown === "chats" && chats.map((c) => (
          <li key={c.id} data-testid="chat" data-id={c.id} data-state={c.state}>
            <button type="button" className="ui-inbox-row" onClick={() => onOpenChat(c)} data-testid="open-chat">
              <span className="ui-inbox-name">{c.name}, {c.age}</span>
              <span className="ui-inbox-line">{c.state === "ended" ? say("web.inbox.ended") : say("web.inbox.span", { n: c.my_span })}</span>
              <span className="ui-inbox-foot">
                <span className="ui-inbox-time">{marksOf(c)}</span>
                {(c.pending_messages ?? 0) > 0 && <span className="ui-inbox-wait">{say("web.inbox.waits_you")}</span>}
              </span>
              {marksOf(c).startsWith("●") && <span className="ui-dot" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
    </main>
  );
}
