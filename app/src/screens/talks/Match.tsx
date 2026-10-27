// w3_match (sosed Dusk, mobile): two faces and the hand between them, "you and Nino are both in", the two phrases
// that met, "Let's talk" and "Not now" — the web's useMatch moves: keys.consent (POST consent with this device's
// chat key), client.decline and its undo. Once I said yes (here, or the node remembers it) the screen is the wait (w3_match-waiting, MatchWaiting.tsx).
// What to show is talks-logic.ts matchView. Testids (the web's): talk, not-now, match-hint, error.
// The keys are the seat's (App.tsx chatKeys, depth/web-platform/chat/keys.ts chatKeysFor); my initial from my profile.
import { useEffect, useRef, useState } from "react";
import type { ChatKeys } from "@platform/chat/keys.ts";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Rail } from "../../shell/TabBar";
import { matchExit } from "./match-exit";
import { MatchWaiting } from "./MatchWaiting";
import { matchView, type MatchRow } from "./talks-logic";


const EXIT_FALLBACK_MS = 1500;

// No back button on the sheet: the system Back leaves it, onto the inbox it was opened over.
export function Match({ client, keys, row, onAgreed, onWaiting, onBack, onTalks }: {
  client: Client; keys: ChatKeys; row: MatchRow;
  onAgreed: (chatId: string) => void; onWaiting: (row: MatchRow) => void; onBack: () => void; onTalks: () => void;
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

  if (view === "waiting" || view === "gone") return <MatchWaiting client={client} keys={keys} row={row} startGone={view === "gone"} onBack={onBack} onTalks={onTalks} />;
  const title = say("app.match.both", { name: row.name });
  // offer.html: the bar (back, the title in its pill), the panel (the pair with the mark between, the words, the two phrases as tiles), the foot («not now» round, «talk» wide)
  return (
    <Screen name="match" title={title} className="k-screen" data-id={row.id} data-view={view}>
      <div className="k-col">
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
          {row.my_phrase && <article className="k-tile k-tk-quote"><div className="k-row"><span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span><span className="k-meta">{say("app.match.you_said")}</span></div><p>{row.my_phrase.text}</p></article>}
          <article className="k-tile k-tk-quote"><div className="k-row"><span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span><span className="k-meta">{say("app.match.they_said", { name: row.name })}</span></div><p>{row.phrase.text}</p></article>
          {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
        </section>
        <section className="k-panel k-actions">
          <div className="k-row">
            <button type="button" className="k-tk-round" aria-label={say(declined ? "inbox.undo" : "app.match.not_now")} aria-pressed={declined} disabled={busy || leaving} onClick={notNow} data-testid="not-now"><NdIcon name={declined ? "refresh" : "clock"} /></button>
            <button type="button" className="k-cta" disabled={busy || declined || leaving} onClick={talk} data-testid="talk"><NdIcon name="talks" /><span>{say("app.match.talk")}</span></button>
          </div>
        </section>
        <Rail active="chats" />
      </div>
    </Screen>
  );
}
