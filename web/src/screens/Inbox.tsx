// Screen 06/07 (chat spec §8.12): offers to talk first, conversations after,
// in one list from GET /inbox?since — the marks are the node's own events
// since the last look (P3: arrived, answered, opened, replies waiting, one's
// own term in its last fifth). The page tells them in words — the «новое» chip
// and dot, «ждёт вас», «скоро исчезнет» — not in symbols a reader would
// pronounce as «black circle». marksOf still says them as depth does.
// The moment of the last look lives in this tab (sessionStorage): the first
// look of a tab sees everything live as new. Kit elements only (K5).

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import type { ChatRow } from "../chat/keys.ts";
import { duration } from "../locales/duration.ts";
import { LANG, say } from "../locales/say.ts";
import "../chat/chat.css";
import { Card, CardOpen, openerIds } from "../ui/Card.tsx";
import { Chip } from "../ui/Chip.tsx";
import "./talk.css";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { InboxRow as ChatRowButton } from "../ui/InboxRow.tsx";
import { List, ListItem } from "../ui/List.tsx";
import { UndoRow } from "../ui/Message.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Tabs } from "../ui/Tabs.tsx";
import { lifeOf } from "../../../depth/core/life.ts";
import { Life } from "./Match.tsx";

export interface MatchRow {
  kind: "match";
  id: string;
  name: string;
  age: number;
  // expires_at: what is left of the phrases, told to this match only
  // (relay routes/inbox.ts, §8.11); absent once a phrase left the feed.
  phrase: { text: string; mode: string; expires_at?: number };
  my_phrase?: { text: string; mode: string; expires_at?: number };
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

const isFresh = (r: InboxRow) => marksOf(r).startsWith("●");

// Sheets 23/24 in the offer's row: the other's phrase as a bar, and
// «скоро исчезнет» in its last fifth — never its minutes (19.09.2026); my own
// phrase, when the match came from it, may say how long it has.
function PhraseLife({ row }: { row: MatchRow }) {
  const theirs = lifeOf(row.phrase.expires_at);
  const mine = lifeOf(row.my_phrase?.expires_at);
  if (theirs === null && mine === null) return null;
  return (
    <div className="ui-life" data-testid="offer-life">
      <Life end={row.phrase.expires_at} tone="theirs" />
      {theirs?.soon && <span className="ui-hint" data-testid="offer-soon">{say("web.inbox.soon")}</span>}
      {/* С6 (walk 11.10): the line is about one's own phrase, not the one above
          it — so that phrase is named first, in quotes. */}
      {mine && row.my_phrase && (
        <p className="ui-hint">
          <q data-testid="offer-mine-text">{row.my_phrase.text}</q>{" · "}
          <span data-testid="offer-mine-left">{say("web.inbox.mine_left", { left: duration(mine.minutes) })}</span>
        </p>
      )}
    </div>
  );
}

const clock = (seconds?: number) =>
  seconds === undefined ? undefined : new Date(seconds * 1000).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit" });

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

  // No refresh button (strict review 11.10): the list is read on opening, and again each time the
  // person comes back to the window or the tab — the same GET /inbox?since, nothing new.
  useEffect(() => {
    void load();
    const again = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = rows.filter((r): r is MatchRow => r.kind === "match");
  const chats = rows.filter((r): r is InboxChatRow => r.kind === "chat");
  const shown = tab ?? (chats.length > 0 ? "chats" : "offers");
  const title = say("web.inbox.title");
  const offers = (
    <List label={say("web.inbox.offers")} data-testid="matches">
      {shown === "offers" && matches.map((m) => (
        // The whole row is the press (RowList): a transparent opener covers the card, no button inside it.
        <Card as="li" key={m.id} kind="nested" data-testid="match" data-id={m.id}>
          <CardOpen id={`match-${m.id}`} onOpen={() => onOpenMatch(m)} testid="open-match" />
          <div className="ui-card-head">
            <strong id={openerIds(`match-${m.id}`).text}>{m.name}, {m.age}</strong>
            {isFresh(m) && <Chip label={say("web.ui.new")} tone="accent" />}
          </div>
          <p>{m.phrase.text}</p>
          <PhraseLife row={m} />
          <span className="ui-hint" id={openerIds(`match-${m.id}`).foot}>{m.waiting_for_you ? say("web.inbox.waits_you") : say("web.inbox.offer")}</span>
        </Card>
      ))}
      {shown === "offers" && declined.filter((d) => !matches.some((m) => m.id === d.id)).map((d) => (
        <Card as="li" key={d.id} kind="nested" data-testid="match" data-id={d.id} data-declined="yes">
          <strong>{d.name}, {d.age}</strong>
          <p>{d.phrase.text}</p>
          <UndoRow mark={say("inbox.declined")} action={{ label: say("inbox.undo"), disabled: undoing === d.id, onSelect: () => void undo(d), testid: "undo-decline" }} />
        </Card>
      ))}
    </List>
  );
  // A conversation is the kit's row-chat: name, a line, the time; the dot and
  // «ждёт вас» on the right when replies wait.
  const conversations = (
    <List label={say("web.inbox.chats")} data-testid="chats">
      {shown === "chats" && chats.map((c) => (
        <ListItem key={c.id} data-testid="chat" data-id={c.id} data-state={c.state}>
          <ChatRowButton
            name={`${c.name}, ${c.age}`}
            line={(c.state === "ended" ? say("web.inbox.ended") : say("web.inbox.span", { left: duration(c.my_span) })) + (c.ending_soon ? ` · ${say("web.inbox.soon")}` : "")}
            time={clock(c.last_activity_at)}
            wait={(c.pending_messages ?? 0) > 0 ? say("web.inbox.waits_you") : undefined}
            dot={isFresh(c)}
            onOpen={() => onOpenChat(c)}
            data-testid="open-chat"
          />
        </ListItem>
      ))}
    </List>
  );
  return (
    <Screen
      name="inbox"
      title={title}
      header={<HeaderScreen title={title} />}
    >
      {state === "failed" && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {state === "ready" && rows.length === 0 && (
        <EmptyState title={say("web.inbox.empty")} line={say("web.inbox.empty_hint")} data-testid="quiet" />
      )}
      {/* Two tabs, as the bottom row of screen-20-21-22-24: offers to talk and
          conversations; a tab that holds something new since the last look says
          «новое» in its name and wears the dot. It opens on the conversations
          when there are any. */}
      {rows.length + declined.length > 0 && (
        <Tabs
          label={title}
          value={shown}
          onChange={(id) => setTab(id as "offers" | "chats")}
          tabs={[
            { id: "offers", label: say("web.inbox.offers"), fresh: matches.some(isFresh), testid: "tab-offers" },
            { id: "chats", label: say("web.inbox.chats"), fresh: chats.some(isFresh), testid: "tab-chats" },
          ]}
          panels={{ offers, chats: conversations }}
        />
      )}
      {state === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
    </Screen>
  );
}
