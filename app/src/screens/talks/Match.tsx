// w3_match (sosed Dusk, mobile): two faces and the hand between them, "you and Nino are both in", the two phrases
// that met, "Let's talk" and "Not now" — the web's useMatch moves: keys.consent (POST consent with this device's
// chat key), client.decline and its undo. Once I said yes the screen is the wait (w3_match-waiting, MatchWaiting.tsx).
// What to show is talks-logic.ts matchView. Testids (the web's): talk, not-now, match-hint, error.
// The keys are the seat's (App.tsx chatKeys, depth/web-platform/chat/keys.ts chatKeysFor); my initial from my profile.
import { useEffect, useState } from "react";
import type { ChatKeys } from "@platform/chat/keys.ts";
import type { Client } from "@sdk/client.ts";
import { failedLine, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { hand } from "../../shell/icons";
import { Screen } from "../../shell/Screen";
import { initial } from "../me/me-logic";
import { matchView, type MatchRow } from "./talks-logic";


// No back button on the sheet: the system Back leaves it, onto the inbox it was opened over.
export function Match({ client, keys, row, onAgreed, onWaiting }: {
  client: Client; keys: ChatKeys; row: MatchRow;
  onAgreed: (chatId: string) => void; onWaiting: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState("");
  useEffect(() => { client.profile().then((p) => setMe(String((p as { name?: string }).name ?? ""))).catch(() => setMe("")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const view = matchView(row, { agreed: false, declined });

  const talk = () => {
    setBusy(true); setError(null);
    keys.consent(row.id).then((answer) => {
      if (answer.status !== 200) throw new Error(`consent: ${answer.status}`);
      if (answer.body.state === "agreed" && answer.body.chat_id) onAgreed(answer.body.chat_id);
      else onWaiting();
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

  const title = say("app.match.both", { name: row.name });
  return (
    <Screen name="match" title={title} className="tk-match-screen" data-id={row.id} data-view={view}>
      <section className="tk-match">
        <span className="tk-pill">{say("app.match.pill")}</span>
        <div className="tk-pair" aria-hidden="true">
          <span className="tk-big" data-face="1">{initial(me)}</span>
          <span className="tk-hand"><Icon d={hand} /></span>
          <span className="tk-big" data-face="0">{initial(row.name)}</span>
        </div>
        <h1 className="tk-match-title">{title}</h1>
        <p className="tk-match-hint" data-testid="match-hint">{say(view === "they-agreed" ? "web.match.agreed" : "app.match.hint")}</p>
        <div className="tk-quotes">
          {row.my_phrase && <figure className="tk-quote"><figcaption>{say("app.match.you_said")}</figcaption><blockquote>{row.my_phrase.text}</blockquote></figure>}
          <figure className="tk-quote"><figcaption>{say("app.match.they_said", { name: row.name })}</figcaption><blockquote>{row.phrase.text}</blockquote></figure>
        </div>
        {error && <p className="me-error" role="alert" data-testid="error">{error}</p>}
        <button type="button" className="tk-talk" disabled={busy || declined} onClick={talk} data-testid="talk">{say("app.match.talk")}</button>
        <button type="button" className="tk-later" disabled={busy} onClick={notNow} data-testid="not-now">{say(declined ? "inbox.undo" : "app.match.not_now")}</button>
      </section>
    </Screen>
  );
}
