// w3_match-waiting (sosed Dusk, mobile): I said yes, the other has not yet. Their face and name, an empty ring (no talk
// yet, no hour running), what happens next, the lines I write meanwhile — kept on this device by the seat's chat keys
// (keys.queue, unsealed: there is no key yet) and sent once the talk opens — the line to write, and "To talks".
// Every 5 s the inbox is asked whether they said "not now" to my yes (talks-logic.ts goneIn, as web useMatch);
// then the queue is dropped and the wait says the offer is gone. Testids (the web's): waiting, queued, queued-line,
// enqueue, to-inbox, tombstone; plus waiting-back.
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { ChatKeys } from "@platform/chat/keys.ts";
import type { Client } from "@sdk/client.ts";
import { label, LANG, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Rail } from "../../shell/TabBar";
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
  // offer-waiting.html / offer-gone.html: the bar, the panel (the hourglass or the fade in its circle, who, the note, my queued lines as bubbles), the foot
  return (
    <Screen name="match-waiting" title={title} className="k-screen" data-id={row.id} data-gone={gone ? "yes" : "no"}>
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={onBack} data-testid="waiting-back"><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{title}</h1>
        </header>
        <section className="k-panel k-grow k-tk-wait" data-testid="waiting">
          <div className="k-tk-mid-box">
            <span className="k-tk-hero" data-tone={gone ? "5" : "2"} data-ring={gone ? undefined : ""}><NdIcon name={gone ? "fade" : "hourglass"} /></span>
            <div className="k-tk-words">
              <p className="k-title">{row.name}, {row.age}</p>
              <p className="k-sub">{say(gone ? "web.match.gone" : "app.wait.state")}</p>
            </div>
            {gone
              ? <p className="k-note" data-testid="tombstone">{say("web.match.gone")}</p>
              : <p className="k-note"><NdIcon name="eye" /><span>{say("app.wait.note", { name: row.name })}</span></p>}
          </div>
          <ol className="k-tk-queue" aria-label={say("web.match.waiting")} data-testid="queued">
            {lines.map((l, i) => (
              <li key={i} className="k-tk-bubble-row" style={{ "--i": l.at === undefined ? i : 0 } as CSSProperties}>
                <p className="k-tk-bubble">{l.text}</p>
                {l.at !== undefined && <time className="k-meta">{clock(l.at)}</time>}
              </li>
            ))}
          </ol>
        </section>
        <section className="k-panel k-actions">
          {gone ? (
            <button type="button" className="k-cta" onClick={onTalks} data-testid="to-inbox"><NdIcon name="talks" /><span>{say("app.wait.to_talks")}</span></button>
          ) : (
            <form className="k-row" onSubmit={send}>
              <button type="button" className="k-tk-round k-tk-round-52" aria-label={say("app.wait.to_talks")} onClick={onTalks} data-testid="to-inbox"><NdIcon name="talks" /></button>
              <input className="k-tk-input" value={line} onChange={(e) => setLine(e.target.value)} placeholder={say("app.wait.message")} aria-label={say("web.match.line_label")} data-testid="queued-line" />
              <button type="submit" className="k-tk-send" aria-label={say("web.match.enqueue")} disabled={!line.trim()} data-testid="enqueue"><NdIcon name="send" /></button>
            </form>
          )}
        </section>
        <Rail active="chats" />
      </div>
    </Screen>
  );
}
