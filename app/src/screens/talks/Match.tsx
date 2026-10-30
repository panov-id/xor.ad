// w3_match (sosed Dusk, mobile): two faces and the hand between them, "you and Nino are both in", the two phrases
// that met, "Let's talk" and "Not now" — the web's useMatch moves: keys.consent (POST consent with this device's
// chat key), client.decline and its undo. Once I said yes (here, or the node remembers it) the screen is the wait (w3_match-waiting, MatchWaiting.tsx).
// What to show is talks-logic.ts matchView. Testids (the web's): talk, not-now, match-hint, error.
// The keys are the seat's (App.tsx chatKeys, depth/web-platform/chat/keys.ts chatKeysFor); my initial from my profile.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatKeys } from "@platform/chat/keys.ts";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Rail } from "../../shell/TabBar";
import { matchExit } from "./match-exit";
import { MatchWaiting } from "./MatchWaiting";
import { matchView, SILENCE, type MatchRow } from "./talks-logic";

// offer.html: the phrase's mode in the card's corner, as the feed tile's badge (feed-card.tsx MODE_ICON); the ring is the hour a talk lives in silence
const MODE_ICON: Record<string, string> = { alone: "alone", company: "friends", friends: "friends", party: "party" };


const EXIT_FALLBACK_MS = 1500;

// No back button on the sheet: the system Back leaves it, onto the inbox it was opened over.
/** `frame`: a screen of its own (the phone), or the right pane beside the talks (desktop-1440 5-talks/offer.svg), as Chat's. */
export function TalkFrame({ frame, name, title, data, children }: { frame: "screen" | "pane"; name: string; title: string; data: { [k: `data-${string}`]: string | undefined }; children: ReactNode }) {
  return frame === "screen"
    ? <Screen name={name} title={title} className="k-screen" {...data}><div className="k-col">{children}<Rail active="chats" /></div></Screen>
    : <section className="k-ch-pane" aria-label={title} data-pane={name} {...data}><div className="k-col">{children}</div></section>;
}

export function Match({ client, keys, row, onAgreed, onWaiting, onBack, onTalks, frame = "screen" }: {
  client: Client; keys: ChatKeys; row: MatchRow;
  onAgreed: (chatId: string) => void; onWaiting: (row: MatchRow) => void; onBack: () => void; onTalks: () => void; frame?: "screen" | "pane";
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState("");
  // MOTION.md 04: the card goes out (.96, fades) before the screen turns into the wait or the chat; `after` runs when the exit has played.
  const [leaving, setLeaving] = useState(false);
  const exit = useRef(matchExit(EXIT_FALLBACK_MS)).current;
  useEffect(() => exit.dispose, [exit]);
  const leave = (go: () => void) => { setLeaving(true); exit.leave(go); };
  const left = exit.left;
  useEffect(() => { client.profile().then((p) => setMe(String((p as { name?: string }).name ?? ""))).catch(() => setMe("")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const view = matchView(row, { agreed, declined });

  const talk = () => {
    setBusy(true); setError(null);
    keys.consent(row.id).then((answer) => {
      if (answer.status !== 200) throw new Error(`consent: ${answer.status}`);
      const chat = answer.body.state === "agreed" ? answer.body.chat_id : undefined;
      leave(() => { if (chat) onAgreed(chat); else { setAgreed(true); onWaiting({ ...row, my_consent: "waiting" }); } });
    }).catch((e: Error) => setError(failedLine(e))).finally(() => setBusy(false));
  };
  const notNow = () => {
    setBusy(true); setError(null);
    (declined ? client.undoDecline(row.id) : client.decline(row.id)).then((answer) => {
      if (answer.status !== 204) throw new Error(`decline: ${answer.status}`);
      if (!declined) keys.dropQueued(row.id);
      setDeclined(!declined);
    }).catch((e: Error) => setError(failedLine(e))).finally(() => setBusy(false));
  };

  if (view === "waiting" || view === "gone") return <MatchWaiting client={client} keys={keys} row={row} startGone={view === "gone"} onBack={onBack} onTalks={onTalks} frame={frame} />;
  const title = say("app.match.both", { name: row.name });
  // offer.html: the bar (back, the title in its pill), the panel (the pair with the mark between, the words, the two phrases as tiles), the foot («not now» round, «talk» wide)
  return (
    <TalkFrame frame={frame} name="match" title={title} data={{ "data-id": row.id, "data-view": view }}>
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={onBack} data-testid="match-back"><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{title}</h1>
        </header>
        <section className="k-panel k-grow k-tk-offer" data-leaving={leaving ? "" : undefined} onAnimationEnd={(e) => { if (e.target === e.currentTarget && leaving) left(); }}>
          <div className="k-tk-pair" aria-hidden="true">
            <span className="k-tk-big"><NdIcon name="me" /></span>
            <span className="k-tk-mid"><NdIcon name="both" /></span>
            <span className="k-tk-big" data-peer=""><NdIcon name="me" /></span>
          </div>
          <div className="k-tk-words">
            <p className="k-title">{say("app.match.pill")}</p>
            <p className="k-sub" data-testid="match-hint">{say(view === "they-agreed" ? "web.match.agreed" : "app.match.hint")}</p>
          </div>
          <article className="k-tile k-tk-quote"><div className="k-row"><span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span><span className="k-meta">{say("app.match.they_said", { name: row.name })}</span></div>
            <span className="k-badge" data-c="6" aria-hidden="true" data-testid="match-mode"><NdIcon name={MODE_ICON[row.phrase.mode] ?? "phrase"} /></span>
            <p>{row.phrase.text}</p>
            <div className="k-foot">
              <svg className="k-tk-ring" width="40" height="40" role="img" aria-label={say("app.talks.minutes", { n: SILENCE / 60 })} data-testid="match-ring">
                <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="5" />
              </svg>
              <button type="button" className="k-round" aria-label={say("app.match.talk")} disabled={busy || declined || leaving} onClick={talk} data-testid="match-talk"><NdIcon name="talks" /></button>
            </div>
          </article>
          {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
        </section>
        <section className="k-panel k-actions">
          <div className="k-row">
            <button type="button" className="k-tk-round" aria-label={say(declined ? "inbox.undo" : "app.match.not_now")} aria-pressed={declined} disabled={busy || leaving} onClick={notNow} data-testid="not-now"><NdIcon name={declined ? "refresh" : "clock"} /></button>
            <button type="button" className="k-cta" disabled={busy || declined || leaving} onClick={talk} data-testid="talk"><NdIcon name="talks" /><span>{say("app.match.talk")}</span></button>
          </div>
        </section>
    </TalkFrame>
  );
}
