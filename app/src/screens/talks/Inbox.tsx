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
import { NdIcon } from "../../shell/NdIcon";
import { useSkeleton } from "../../shell/loading";
import { Screen } from "../../shell/Screen";
import { TabBar, type Tab } from "../../shell/TabBar";
import type { InboxChatRow } from "@platform/chat/keys.ts";
import { chatRowOf, listenInbox, marksSeen, type InboxCause, isFresh, lineOf, ringOf, splitInbox, type MatchRow, type Row, type TalkRow } from "./talks-logic";

const LAST_LOOK = "xor-inbox-last-look";
const now = () => Math.floor(Date.now() / 1000);
// 24 hours, as the sheets write it («21:04») and as a talk's own lines do (screens/chat-logic.ts clockOf)
const clock = (s?: number) => (s === undefined ? "" : new Date(s * 1000).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit", hour12: false }));

// inbox.html: the ring 40 round, 5 thick, r 16 (a circle's length 100.5): the share left on the accent over the track
function Ring({ talk }: { talk: TalkRow }) {
  const ring = ringOf(talk, now());
  if (!ring) return <span className="k-meta">{say("app.talks.ended")}</span>;
  return (
    <svg className="k-tk-ring" width="40" height="40" role="img" aria-label={say("app.talks.minutes", { n: ring.minutes })} data-testid="chat-ring">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--tile-strong)" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(ring.share * 100.5).toFixed(1)} 100.5`} transform="rotate(-90 20 20)" />
    </svg>
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
      {offers.length > 0 && (
        <section className="k-panel">
          <ul className="k-tk-strip" aria-label={label("web.inbox.offers")} data-testid="matches">
            {offers.map((m) => (
              <li key={m.id} data-testid="match" data-id={m.id}>
                <button type="button" className="k-tk-face" data-fresh={isFresh(m) || undefined} onClick={() => onOpenMatch(m as MatchRow)}
                  aria-label={`${m.name}, ${m.age}`} data-testid="open-match">
                  <span className="k-tk-circle"><NdIcon name="me" /><span className="k-tk-both"><NdIcon name="both" /></span></span>
                  <span className="k-meta" aria-hidden="true">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {offers.length === 0 && <ul hidden data-testid="matches" aria-label={label("web.inbox.offers")} />}
      {rows?.length === 0 && !error ? (
        <section className="k-panel k-grow k-tk-empty" data-testid="quiet">
          <span className="k-tk-hero" data-tone="4"><NdIcon name="both" /></span>
          <h2>{say("web.inbox.empty")}</h2>
          <p>{say("app.talks.sub")}</p>
        </section>
      ) : (
        <section className="k-body k-pad8">
          {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
          {skeleton && (
            <div className="k-tk-rows" data-testid="inbox-skeleton" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="k-tk-row k-ghost" />)}
            </div>
          )}
          <ul className="k-tk-rows" aria-label={label("web.inbox.chats")} data-testid="chats">
            {talks.map((c) => (
              <li key={c.id} data-testid="chat" data-id={c.id} data-state={c.state}>
                <button type="button" className="k-tk-row" aria-current={c.id === selectedId ? "true" : undefined} disabled={!chatRowOf(c)} onClick={() => { const row = chatRowOf(c); if (row) onOpenChat(row); }} data-testid="open-chat">
                  <span className="k-tk-ava" aria-hidden="true"><NdIcon name="me" /></span>
                  <span className="k-stack k-tk-who">
                    <span className="k-row-name">{c.name}, {c.age}</span>
                    <span className="k-meta k-tk-line">{clock(c.last_activity_at)} · {lineOf(c, say)}</span>
                  </span>
                  <span className="k-tk-trail">
                    <Ring talk={c} />
                    {isFresh(c) && <span className="k-tk-dot" role="img" aria-label={say("web.ui.new")} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
    <Screen name="inbox" title={title} className="k-screen" data-beside={beside ? "" : undefined}>
      <div className="k-col">
        <section className="k-panel">
          <div className="k-row">
            <NdIcon name="talks" className="k-pin k-tk-head-ico" />
            <div className="k-stack"><h1 className="k-title">{title}</h1><p className="k-sub">{say("app.talks.sub")}</p></div>
            <button type="button" className="k-icon-btn k-tk-offers" aria-label={say("app.talks.offers")} onClick={onLikes} data-testid="open-likes"><NdIcon name="imin" /></button>
          </div>
          {/* the desktop's line over the title (desktop_1440_Talks «4 talks · 3 new offers»): counted off the inbox's rows */}
          {rows && <p className="tk-count">{say("app.talks.count", { talks: splitInbox(rows).talks.length, offers: splitInbox(rows).offers.filter(isFresh).length })}</p>}
        </section>
        <TalksList rows={rows} error={error} actions={{ onOpenMatch, onOpenChat, onLikes }} selectedId={selectedId} />
        {beside}
        <TabBar active="chats" onSelect={onTab} />
      </div>
    </Screen>
  );
}
