// w3_inbox (sosed Dusk, mobile): the offers to talk as a strip of faces on top — its first circle opens what I am in
// on (w3_likes) — and the talks as rows below, each with the minutes left of its hour of silence as a ring. One
// GET /inbox?since page (client.inboxSince), read on opening and again on coming back to the window, as the web's
// Inbox; the rules are talks-logic.ts. Testids (the web's): matches, match, open-match, chats, chat, open-chat,
// quiet, error; plus open-likes and chat-ring.
// Not as the sheet: the line under a talk is the web's (waiting, over, my span), not its last line — the inbox
// carries no text of a talk; the search in the head is not drawn (the web has no search over talks).
import { type ReactNode, useEffect, useState, type CSSProperties } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { hand } from "../../shell/icons";
import { useSkeleton } from "../../shell/loading";
import { Screen } from "../../shell/Screen";
import { Skeleton } from "../../shell/Skeleton";
import { TabBar, type Tab } from "../../shell/TabBar";
import { initial } from "../me/me-logic";
import type { InboxChatRow } from "@platform/chat/keys.ts";
import { chatRowOf, listenInbox, marksSeen, type InboxCause, isFresh, lineOf, ringOf, splitInbox, type MatchRow, type Row, type TalkRow } from "./talks-logic";

const LAST_LOOK = "xor-inbox-last-look";
const FACES = 4; // the sheet's avatar colours, in turn
const now = () => Math.floor(Date.now() / 1000);
// 24 hours, as the sheets write it («21:04») and as a talk's own lines do (screens/chat-logic.ts clockOf)
const clock = (s?: number) => (s === undefined ? "" : new Date(s * 1000).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit", hour12: false }));

function Ring({ talk }: { talk: TalkRow }) {
  const ring = ringOf(talk, now());
  if (!ring) return <span className="tk-ended">{say("app.talks.ended")}</span>;
  return (
    <span className="tk-ring" style={{ "--share": ring.share } as CSSProperties} role="img"
      aria-label={say("app.talks.minutes", { n: ring.minutes })} data-testid="chat-ring">
      <span aria-hidden="true">{ring.minutes}</span>
    </span>
  );
}

/** The inbox page, read on opening, on coming back to the window and when the node says it changed. `mark`: this look is the person's own (the
 * talks' screen) and moves the «new» marks' moment; the desktop's right pane reads the same page without moving it. */
export function useInbox(client: Client, mark: boolean): { rows: Row[] | null; error: string | null } {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // One read at a time: a signal that comes while a read is out asks for one more after it, not a second at once.
    let reading = false;
    let queued: InboxCause | null = null;
    const load = (cause: InboxCause) => {
      if (reading) { queued = queued && !marksSeen(cause, true) ? queued : cause; return; }
      reading = true;
      let since: number | undefined;
      try { since = Number(sessionStorage.getItem(LAST_LOOK) ?? "") || undefined; } catch { /* no storage: all is new */ }
      client.inboxSince(since).then((page) => {
        setRows(page.items as unknown as Row[]);
        setError(null);
        if (marksSeen(cause, mark)) { try { sessionStorage.setItem(LAST_LOOK, String(now())); } catch { /* as above */ } }
      }).catch((e: Error) => setError(failedLine(e))).finally(() => {
        reading = false;
        const next = queued;
        queued = null;
        if (next) load(next);
      });
    };
    load("open");
    const again = () => { if (document.visibilityState !== "hidden") load("focus"); };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    // a person standing on the list sees a chat opened meanwhile: the node's channel says «changed» (protocol §4.4)
    const stop = listenInbox(() => client.openInbox(), () => load("signal"));
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, error };
}

export interface TalksActions { onOpenMatch: (row: MatchRow) => void; onOpenChat: (row: InboxChatRow) => void; onLikes: () => void }

/** The strip of offers and the rows of talks: the talks' screen and the desktop's right pane draw the same list. */
export function TalksList({ rows: asked, error, actions, selectedId }: { rows: Row[] | null; error: string | null; actions: TalksActions; selectedId?: string }) {
  const { onOpenMatch, onOpenChat, onLikes } = actions;
  // MOTION.md: while the page is asked for, grey rows with the shimmer (not under 300 ms, not under 600 ms once shown): an answer that
  // lands while they stand waits behind them
  const skeleton = useSkeleton(asked === null && !error);
  const rows = skeleton ? null : asked;
  const { offers, talks } = splitInbox(rows ?? []);
  return (
    <>
      <ul className="tk-strip" aria-label={label("web.inbox.offers")} data-testid="matches">
        <li>
          <button type="button" className="tk-face tk-offers" onClick={onLikes} data-testid="open-likes">
            <span className="tk-circle"><Icon d={hand} /></span>
            <span className="tk-label">{say("app.talks.offers")}</span>
          </button>
        </li>
        {offers.map((m, i) => (
          <li key={m.id} data-testid="match" data-id={m.id}>
            <button type="button" className="tk-face" data-fresh={isFresh(m) || undefined} onClick={() => onOpenMatch(m as MatchRow)}
              aria-label={`${m.name}, ${m.age}`} data-testid="open-match">
              <span className="tk-circle" data-face={i % FACES}>{initial(m.name)}</span>
              <span className="tk-label" aria-hidden="true">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="k-note k-error" role="alert" data-testid="error">{error}</p>}
      {rows?.length === 0 && <p className="tk-quiet" data-testid="quiet">{say("web.inbox.empty")}</p>}
      {skeleton && (
        <div className="tk-skeletons" data-testid="inbox-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} kind="row" />)}
        </div>
      )}
      <ul className="tk-rows" aria-label={label("web.inbox.chats")} data-testid="chats">
        {talks.map((c, i) => (
          <li key={c.id} data-testid="chat" data-id={c.id} data-state={c.state}>
            <button type="button" className="tk-row" aria-current={c.id === selectedId ? "true" : undefined} disabled={!chatRowOf(c)} onClick={() => { const row = chatRowOf(c); if (row) onOpenChat(row); }} data-testid="open-chat">
              <span className="tk-avatar" data-face={i % FACES} aria-hidden="true">{initial(c.name)}</span>
              <span className="tk-who">
                <span className="tk-name">{c.name}, {c.age}</span>
                <span className="tk-time">{clock(c.last_activity_at)}</span>
                <span className="tk-line">{lineOf(c, say)}</span>
              </span>
              <Ring talk={c} />
              {isFresh(c) && <span className="tk-dot" role="img" aria-label={say("web.ui.new")} />}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The tablet and up (tablet_834_Talks): the open talk stands beside the list (`beside`, the shell's ChatPane in its pane
 * frame), its row lit (`selectedId`); with none chosen yet, the first talk that opens is chosen (`pickFirst`), as the sheet. */
export function Inbox({ client, onTab, onOpenMatch, onOpenChat, onLikes, beside, selectedId, pickFirst }: {
  client: Client; onTab: (tab: Tab) => void;
  onOpenMatch: (row: MatchRow) => void; onOpenChat: (row: InboxChatRow) => void; onLikes: () => void;
  beside?: ReactNode; selectedId?: string; pickFirst?: boolean;
}) {
  const { rows, error } = useInbox(client, true);
  useEffect(() => {
    if (!pickFirst || selectedId || !rows) return;
    for (const c of splitInbox(rows).talks) { const row = chatRowOf(c); if (row) { onOpenChat(row); return; } }
  }, [pickFirst, selectedId, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = say("app.talks.title");
  return (
    <Screen name="inbox" title={title} className="tk" data-beside={beside ? "" : undefined}>
      <header className="me-head"><span className="word">sosed</span></header>
      {/* the desktop's line over the title (desktop_1440_Talks «4 talks · 3 new offers»): counted off the inbox's rows */}
      {rows && <p className="tk-count">{say("app.talks.count", { talks: splitInbox(rows).talks.length, offers: splitInbox(rows).offers.filter(isFresh).length })}</p>}
      <h1 className="tk-title">{title}</h1>
      <p className="tk-sub">{say("app.talks.sub")}</p>
      <div className="tk-sheet">
        <div className="tk-list"><TalksList rows={rows} error={error} actions={{ onOpenMatch, onOpenChat, onLikes }} selectedId={selectedId} /></div>
        {beside}
      </div>
      <TabBar active="chats" onSelect={onTab} />
    </Screen>
  );
}
