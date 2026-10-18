// w3_match-waiting (sosed Dusk, mobile): I said yes, the other has not yet. Their face and name, an empty ring (no talk
// yet, no hour running), what happens next, the lines I write meanwhile — kept on this device by the seat's chat keys
// (keys.queue, unsealed: there is no key yet) and sent once the talk opens — the line to write, and "To talks".
// Every 5 s the inbox is asked whether they said "not now" to my yes (talks-logic.ts goneIn, as web useMatch);
// then the queue is dropped and the wait says the offer is gone. Testids (the web's): waiting, queued, queued-line,
// enqueue, to-inbox, tombstone; plus waiting-back.
import { useEffect, useState, type FormEvent } from "react";
import type { ChatKeys } from "@platform/chat/keys.ts";
import type { Client } from "@sdk/client.ts";
import { label, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { arrowRight, chat, chevronLeft } from "../../shell/icons";
import { Screen } from "../../shell/Screen";
import { eye } from "../me/icons";
import { initial } from "../me/me-logic";
import { goneIn, type MatchRow, type Row } from "./talks-logic";

const LOOK_MS = 5000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit" });

export function MatchWaiting({ client, keys, row, startGone, onBack, onTalks }: {
  client: Client; keys: ChatKeys; row: MatchRow; startGone: boolean; onBack: () => void; onTalks: () => void;
}) {
  const [gone, setGone] = useState(startGone);
  const [lines, setLines] = useState<Array<{ text: string; at?: number }>>(() => keys.queued(row.id).map((text) => ({ text })));
  const [line, setLine] = useState("");
  useEffect(() => {
    let live = true;
    const look = () => client.inbox().then((rows) => {
      if (!live) return;
      setGone((was) => {
        const now = goneIn(rows as unknown as Row[], row.id, was);
        if (now && !was) { keys.dropQueued(row.id); setLines([]); }
        return now;
      });
    }, () => { /* the next look tries again; a wait is not an error to show */ });
    void look();
    const timer = setInterval(look, LOOK_MS);
    return () => { live = false; clearInterval(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = line.trim();
    if (!text || gone) return;
    keys.queue(row.id, text);
    setLines((was) => [...was, { text, at: Date.now() }]);
    setLine("");
  };

  const title = say("app.wait.title");
  return (
    <Screen name="match-waiting" title={title} className="me-sub tk" data-id={row.id} data-gone={gone ? "yes" : "no"}>
      <header className="me-bar">
        <button type="button" className="me-back" aria-label={label("common.back")} onClick={onBack} data-testid="waiting-back"><Icon d={chevronLeft} /></button>
        <h1>{title}</h1>
      </header>
      <div className="tk-sheet tk-wait" data-testid="waiting">
        <div className="tk-wait-who">
          <span className="tk-wait-face" data-face="0" aria-hidden="true">{initial(row.name)}</span>
          <span className="tk-who-text">
            <strong className="tk-wait-name">{row.name}, {row.age}</strong>
            <span className="tk-wait-state">{say(gone ? "web.match.gone" : "app.wait.state")}</span>
          </span>
          <span className="tk-wait-ring" aria-hidden="true" />
        </div>
        {gone
          ? <p className="tk-wait-note" data-testid="tombstone">{say("web.match.gone")}</p>
          : <p className="tk-wait-note"><Icon d={eye} /><span>{say("app.wait.note", { name: row.name })}</span></p>}
        <ol className="tk-queue" aria-label={say("web.match.waiting")} data-testid="queued">
          {lines.map((l, i) => (
            <li key={i} className="tk-bubble-row">
              <p className="tk-bubble">{l.text}</p>
              {l.at !== undefined && <time className="tk-bubble-time">{clock(l.at)}</time>}
            </li>
          ))}
        </ol>
        <div className="tk-wait-foot">
          {!gone && (
            <form className="tk-compose" onSubmit={send}>
              <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={say("app.wait.message")} aria-label={say("web.match.line_label")} data-testid="queued-line" />
              <button type="submit" className="tk-send" aria-label={say("web.match.enqueue")} disabled={!line.trim()} data-testid="enqueue"><Icon d={arrowRight} /></button>
            </form>
          )}
          <button type="button" className="tk-to-talks" onClick={onTalks} data-testid="to-inbox"><Icon d={chat} /><span>{say("app.wait.to_talks")}</span></button>
        </div>
      </div>
    </Screen>
  );
}
