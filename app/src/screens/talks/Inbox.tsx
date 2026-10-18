// w3_inbox (sosed Dusk, mobile): the offers to talk as a strip of faces on top — its first circle opens what I am in
// on (w3_likes) — and the talks as rows below, each with the minutes left of its hour of silence as a ring. One
// GET /inbox?since page (client.inboxSince), read on opening and again on coming back to the window, as the web's
// Inbox; the rules are talks-logic.ts. Testids (the web's): matches, match, open-match, chats, chat, open-chat,
// quiet, error; plus open-likes and chat-ring.
// Not as the sheet: the line under a talk is the web's (waiting, over, my span), not its last line — the inbox
// carries no text of a talk; the search in the head is not drawn (the web has no search over talks).
import { useEffect, useState, type CSSProperties } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { hand } from "../../shell/icons";
import { Screen } from "../../shell/Screen";
import { TabBar, type Tab } from "../../shell/TabBar";
import { initial } from "../me/me-logic";
import { isFresh, lineOf, ringOf, splitInbox, type MatchRow, type Row, type TalkRow } from "./talks-logic";

const LAST_LOOK = "xor-inbox-last-look";
const FACES = 4; // the sheet's avatar colours, in turn
const now = () => Math.floor(Date.now() / 1000);
const clock = (s?: number) => (s === undefined ? "" : new Date(s * 1000).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit" }));

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

export function Inbox({ client, onTab, onOpenMatch, onOpenChat, onLikes }: {
  client: Client; onTab: (tab: Tab) => void;
  onOpenMatch: (row: MatchRow) => void; onOpenChat: (row: TalkRow) => void; onLikes: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => {
      let since: number | undefined;
      try { since = Number(sessionStorage.getItem(LAST_LOOK) ?? "") || undefined; } catch { /* no storage: all is new */ }
      client.inboxSince(since).then((page) => {
        setRows(page.items as unknown as Row[]);
        setError(null);
        try { sessionStorage.setItem(LAST_LOOK, String(now())); } catch { /* as above */ }
      }).catch((e: Error) => setError(failedLine(e)));
    };
    load();
    const again = () => { if (document.visibilityState !== "hidden") load(); };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { offers, talks } = splitInbox(rows ?? []);
  const title = say("app.talks.title");
  return (
    <Screen name="inbox" title={title} className="tk">
      <header className="me-head"><span className="word">sosed</span></header>
      <h1 className="tk-title">{title}</h1>
      <p className="tk-sub">{say("app.talks.sub")}</p>
      <div className="tk-sheet">
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
        {error && <p className="me-error" role="alert" data-testid="error">{error}</p>}
        {rows?.length === 0 && <p className="tk-quiet" data-testid="quiet">{say("web.inbox.empty")}</p>}
        <ul className="tk-rows" aria-label={label("web.inbox.chats")} data-testid="chats">
          {talks.map((c, i) => (
            <li key={c.id} data-testid="chat" data-id={c.id} data-state={c.state}>
              <button type="button" className="tk-row" onClick={() => onOpenChat(c)} data-testid="open-chat">
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
      </div>
      <TabBar active="chats" onSelect={onTab} />
    </Screen>
  );
}
